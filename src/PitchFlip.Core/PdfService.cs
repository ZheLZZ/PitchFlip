using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;

namespace PitchFlip.Core;

public sealed class PdfService : IDisposable
{
    private readonly byte[] bytes;
    private readonly PdfDocument source;
    public string SourcePath { get; }
    public DocumentState State { get; }
    public Stream OpenRead() => new MemoryStream(bytes, false);
    public PdfService(string path)
    {
        SourcePath = Path.GetFullPath(path);
        bytes = File.ReadAllBytes(SourcePath);
        source = PdfReader.Open(new MemoryStream(bytes, false), PdfDocumentOpenMode.Import);
        State = new(source.Pages.Cast<PdfPage>().Select(p => {
            var m = p.MediaBox;
            // PDFsharp's optional CropBox getter creates an empty box when absent.
            // Never access that getter unless the entry exists on the imported page.
            var c = p.Elements.ContainsKey("/CropBox") ? p.CropBox : m;
            if (c.Width <= 0 || c.Height <= 0) c = m;
            if (m.Width <= 0 || m.Height <= 0) throw new InvalidDataException("页面尺寸异常。");
            return new PageGeometry(m.X1,m.Y1,m.X2,m.Y2,c.X1,c.Y1,c.X2,c.Y2,p.Rotate);
        }));
    }
    public void Export(string destination)
    {
        destination = Path.GetFullPath(destination);
        if (string.Equals(ResolvePath(destination), ResolvePath(SourcePath), StringComparison.OrdinalIgnoreCase))
            throw new IOException("请另选文件名，不能覆盖原 PDF。");
        // Replacing the directory entry (rather than opening the existing target for writing)
        // also protects source files reached through a destination hard link.
        var temporary = destination + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            using var output = new PdfDocument();
            foreach (var slot in State.Pages)
            {
                if (slot.Type == PageSlotType.Original) output.AddPage(source.Pages[slot.OriginalPageNumber!.Value-1]);
                else if (slot.Type == PageSlotType.InsertedBlank)
                {
                    var p = output.AddPage(); var g = slot.Geometry;
                    p.MediaBox = new PdfRectangle(new PdfSharp.Drawing.XPoint(g.X1,g.Y1),new PdfSharp.Drawing.XPoint(g.X2,g.Y2));
                    p.CropBox = new PdfRectangle(new PdfSharp.Drawing.XPoint(g.CropX1,g.CropY1),new PdfSharp.Drawing.XPoint(g.CropX2,g.CropY2)); p.Rotate = g.Rotation;
                }
            }
            output.Save(temporary); File.Move(temporary, destination, true); State.MarkSaved();
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    public void Dispose() => source.Dispose();
    private static string ResolvePath(string path)
    {
        var current=Path.GetPathRoot(path)!;
        foreach(var part in path[current.Length..].Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries))
        {
            current=Path.Combine(current,part);
            FileSystemInfo item=Directory.Exists(current) ? new DirectoryInfo(current) : new FileInfo(current);
            if(item.Exists && item.Attributes.HasFlag(FileAttributes.ReparsePoint)) current=item.ResolveLinkTarget(true)?.FullName ?? current;
        }
        return current;
    }
}
