using System.IO;
using System.Text.Json;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;
using PitchFlip.Core;

namespace PitchFlip;
public partial class MainWindow : Window
{
    private PdfService? document;
    private bool ready, busy;
    private int revision;
    private readonly string profile = Path.Combine(Path.GetTempPath(), "PitchFlip", Guid.NewGuid().ToString("N"));
    public MainWindow()
    {
        InitializeComponent(); Loaded += async (_,_) => await Initialize();
        Closing += (_,e) => { if (busy || !CanDiscard()) e.Cancel = true; };
        Closed += (_,_) => {
            document?.Dispose(); Browser.Dispose();
            for(var attempt=0;attempt<12;attempt++) {
                try { if(Directory.Exists(profile)) Directory.Delete(profile,true); break; }
                catch(IOException) { Thread.Sleep(100); }
                catch(UnauthorizedAccessException) { break; }
            }
        };
    }
    private bool CanDiscard() => document?.State.IsDirty != true || MessageBox.Show(this,"当前文件存在未导出的编排调整。是否放弃这些调整？","PitchFlip",MessageBoxButton.YesNo,MessageBoxImage.Question)==MessageBoxResult.Yes;
    private async Task Initialize()
    {
        try
        {
            var env = await CoreWebView2Environment.CreateAsync(null,profile,new CoreWebView2EnvironmentOptions("--disable-background-networking --disable-component-update"));
            await Browser.EnsureCoreWebView2Async(env);
            var web = Browser.CoreWebView2;
            web.Settings.AreDefaultContextMenusEnabled=false; web.Settings.AreDevToolsEnabled=false;
            web.Settings.IsStatusBarEnabled=false; web.Settings.IsGeneralAutofillEnabled=false; web.Settings.IsPasswordAutosaveEnabled=false;
            web.SetVirtualHostNameToFolderMapping("pitchflip.local",Path.Combine(AppContext.BaseDirectory,"Web"),CoreWebView2HostResourceAccessKind.DenyCors);
            web.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
            web.WebResourceRequested += (_,e) => {
                var u=new Uri(e.Request.Uri);
                if (u.Host == "document.local" && u.AbsolutePath=="/source.pdf") {
                    e.Response=env.CreateWebResourceResponse(document?.OpenRead(),200,"OK","Content-Type: application/pdf\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: https://pitchflip.local"); return;
                }
                if (u.Host != "pitchflip.local") e.Response=env.CreateWebResourceResponse(null,403,"Blocked","");
            };
            web.NavigationStarting += (_,e) => { if (!e.Uri.StartsWith("https://pitchflip.local/",StringComparison.Ordinal)) e.Cancel=true; };
            web.NewWindowRequested += (_,e) => e.Handled=true;
            web.DownloadStarting += (_,e) => e.Cancel=true;
            web.WebMessageReceived += async (_,e) => {
                try {
                    if(e.AdditionalObjects?.FirstOrDefault() is CoreWebView2File file) { await Open(file.Path); return; }
                    using var j=JsonDocument.Parse(e.WebMessageAsJson); await Handle(j.RootElement);
                }
                catch(Exception ex) { Error(ex); }
            };
            web.Navigate("https://pitchflip.local/index.html");
        } catch(Exception ex) { Error(new Exception("预览初始化失败，请确认已安装 Microsoft Edge WebView2 Runtime。"+ex.Message)); }
    }
    private async Task Handle(JsonElement m)
    {
        var action=m.GetProperty("action").GetString();
        if(action=="ready") { ready=true; var args=Environment.GetCommandLineArgs(); if(args.Length>1 && File.Exists(args[1])) await Open(args[1]); return; }
        if(action=="error") { Status.Text="预览失败："+m.GetProperty("message").GetString(); return; }
        if(action=="open") { OpenClick(this,new RoutedEventArgs()); return; }
        if(busy || document==null) return;
        var s=document.State;
        int index=m.TryGetProperty("index",out var i) ? i.GetInt32() : s.Selected;
        if(action=="select") { s.Selected=Math.Clamp(index,0,s.Pages.Count); return; }
        if(action=="save") { await Save(); return; }
        switch(action) {
            case "insert": Status.Text=s.InsertBlank(Math.Clamp(index,0,s.Pages.Count)) ?? "已插入空白页；后续正反面已更新。"; break;
            case "delete": s.DeleteBlank(index); break;
            case "undo": s.Undo(); break;
            case "redo": s.Redo(); break;
        }
        Publish();
    }
    private void Publish() => Browser.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new {
        kind="state",revision,name=Path.GetFileName(document!.SourcePath),pages=document.State.Pages, selected=document.State.Selected,
        dirty=document.State.IsDirty,canUndo=document.State.CanUndo,canRedo=document.State.CanRedo
    },new JsonSerializerOptions { PropertyNamingPolicy=JsonNamingPolicy.CamelCase }));
    private async void OpenClick(object sender,RoutedEventArgs e)
    {
        if(!ready || busy) return;
        var picker=new OpenFileDialog { Filter="PDF 文件|*.pdf" };
        if(picker.ShowDialog(this)==true) await Open(picker.FileName);
    }
    private async Task Open(string path)
    {
        if(busy || !ready || !CanDiscard()) return;
        busy=true; Status.Text="正在读取 PDF…";
        try { var next=await Task.Run(()=>new PdfService(path)); document?.Dispose(); document=next; revision++; Publish(); Browser.Focus(); Title="PitchFlip · "+Path.GetFileName(path); Status.Text="已打开 · 选择页面后按 B 插入空白，PageDown 向上翻页"; }
        catch(Exception ex) { Error(ex); } finally { busy=false; }
    }
    private async void OnDrop(object sender,DragEventArgs e) { if(e.Data.GetData(DataFormats.FileDrop) is string[] paths && paths.Length>0) await Open(paths[0]); }
    private async void SaveClick(object sender,RoutedEventArgs e) => await Save();
    private async Task Save()
    {
        if(document==null || busy) return;
        var picker=new SaveFileDialog {Filter="PDF 文件|*.pdf",FileName=Path.GetFileNameWithoutExtension(document.SourcePath)+"_Print.pdf",InitialDirectory=Path.GetDirectoryName(document.SourcePath)};
        if(picker.ShowDialog(this)!=true) return;
        busy=true; Status.Text="正在导出 PDF 副本…";
        try { await Task.Run(()=>document.Export(picker.FileName)); Publish(); Status.Text="已保存副本："+picker.FileName; }
        catch(Exception ex) { Error(ex); } finally { busy=false; }
    }
    private void Error(Exception ex) { Status.Text="操作失败"; MessageBox.Show(this,ex.Message,"PitchFlip",MessageBoxButton.OK,MessageBoxImage.Warning); }
}
