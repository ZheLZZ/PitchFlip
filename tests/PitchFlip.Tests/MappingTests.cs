using PitchFlip.Core;
using PdfSharp.Pdf.IO;
using System.Security.Cryptography;

namespace PitchFlip.Tests;
public class MappingTests
{
    private static readonly PageGeometry G = new(0,0,960,540,0,0,960,540,0);
    private static DocumentState Create(int n=6) => new(Enumerable.Repeat(G,n));
    [Theory]
    [InlineData(0, 1)]
    [InlineData(1, 2)]
    [InlineData(4, 1)]
    [InlineData(5, 2)]
    public void StandaloneKeepsOriginalOnFrontAndUndoesAsOneOperation(int index, int added)
    {
        var s=Create(); s.Selected=index; var original=s.Pages.ToArray(); var target=s.Pages[index];
        Assert.True(s.MakeStandalone(index));
        Assert.Equal(6+added,s.Pages.Count);
        Assert.Equal(target,s.Pages[s.Selected]); Assert.Equal(0,s.Selected%2);
        Assert.Equal(PageSlotType.InsertedBlank,s.Pages[s.Selected+1].Type);
        Assert.Equal(original,s.Pages.Where(p=>p.Type==PageSlotType.Original));
        var arranged=s.Pages.ToArray();
        Assert.False(s.MakeStandalone(s.Selected)); Assert.Equal(arranged,s.Pages);
        s.Undo(); Assert.Equal(original,s.Pages); Assert.Equal(index,s.Selected); Assert.False(s.CanUndo);
        s.Redo(); Assert.Equal(arranged,s.Pages);
    }
    [Fact] public void StandaloneReusesBlankAndCopiesTargetGeometry()
    {
        var other=G with {X2=800,Rotation=90}; var s=new DocumentState(new[]{G,other,G});
        s.InsertBlank(2); var blank=s.Pages[2];
        Assert.True(s.MakeStandalone(1)); Assert.Equal(5,s.Pages.Count);
        Assert.Equal(other,s.Pages[1].Geometry); Assert.Equal(blank,s.Pages[3]);
        Assert.False(s.MakeStandalone(1)); Assert.False(s.MakeStandalone(s.Pages.Count));
        var odd=Create(3); Assert.True(odd.MakeStandalone(2));
        Assert.Equal(4,odd.Pages.Count); Assert.Equal(PageSlotType.InsertedBlank,odd.Sheets[1].Back.Slot.Type);
    }
    [Fact] public void StandaloneExportsRealBlankPages()
    {
        using var service=new PdfService(Path.Combine(Root,"samples/PitchFlip-6pages.pdf"));
        service.State.MakeStandalone(1);
        var output=Path.Combine(Root,"artifacts/standalone-export.pdf");Directory.CreateDirectory(Path.GetDirectoryName(output)!);service.Export(output);
        using var pdf=PdfReader.Open(output,PdfDocumentOpenMode.Import);
        Assert.Equal(8,pdf.PageCount); Assert.Empty(pdf.Pages[1].Contents.Elements); Assert.Empty(pdf.Pages[3].Contents.Elements);
        Assert.NotEmpty(pdf.Pages[2].Contents.Elements);
    }
    [Fact] public void MappingPairsOriginals()
    {
        var s=Create(); Assert.Equal(3,s.Sheets.Count);
        Assert.Equal(5,s.Sheets[2].Front.Slot.OriginalPageNumber);
        Assert.Equal(6,s.Sheets[2].Back.Slot.OriginalPageNumber);
        Assert.Equal("正面",s.Map(4).Side); Assert.Equal("背面",s.Map(5).Side);
    }
    [Fact] public void AcceptanceSixToSevenPages()
    {
        var s=Create();s.InsertBlank(4);
        Assert.Equal(new int?[]{1,2,3,4,null,5,6},s.Pages.Select(p=>p.OriginalPageNumber));
        Assert.Equal(4,s.Sheets.Count);Assert.Equal(PageSlotType.InsertedBlank,s.Sheets[2].Front.Slot.Type);
        Assert.Equal(5,s.Sheets[2].Back.Slot.OriginalPageNumber);
        Assert.Equal(PageSlotType.VirtualBlank,s.Sheets[3].Back.Slot.Type);
        Assert.Equal(7,s.Pages.Count);
        s.InsertBlank(5);s.Undo();Assert.Equal(7,s.Pages.Count);s.Redo();Assert.Equal(8,s.Pages.Count);
    }
    [Fact] public void ContentsEightMovesToFrontNine()
    {
        var s=Create(10);s.InsertBlank(7);var p=s.Map(8);
        Assert.Equal(8,p.Slot.OriginalPageNumber);Assert.Equal(9,p.OutputPageNumber);Assert.Equal(5,p.SheetNumber);Assert.Equal("正面",p.Side);
    }
    [Fact] public void OriginalCannotBeDeletedAndUndoRestoresSelection()
    {
        var s=Create();s.Selected=3;var original=s.Pages.ToArray();Assert.False(s.DeleteBlank(3));s.InsertBlank(3);Assert.True(s.DeleteBlank(3));
        s.Undo();Assert.Equal(PageSlotType.InsertedBlank,s.Pages[3].Type);s.Undo();Assert.Equal(original,s.Pages);Assert.Equal(3,s.Selected);Assert.False(s.IsDirty);
    }
    [Fact] public void GeometryAndHistoryBranch()
    {
        var other=G with {X2=800,Rotation=90};var s=new DocumentState(new[]{G,other});
        Assert.NotNull(s.InsertBlank(1));Assert.Equal(G,s.Pages[1].Geometry);s.Undo();s.InsertBlank(0);Assert.False(s.CanRedo);Assert.Equal(G,s.Pages[0].Geometry);
        s.MarkSaved();Assert.False(s.IsDirty);s.Undo();Assert.True(s.IsDirty);s.Redo();Assert.False(s.IsDirty);
    }
    private static string Root => Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"../../../../../"));
    [Fact] public void ExportIsSevenPagesAndProtectsSource()
    {
        var path=Path.Combine(Root,"samples/PitchFlip-6pages.pdf");var hash=SHA256.HashData(File.ReadAllBytes(path));
        using var service=new PdfService(path);service.State.InsertBlank(4);
        var output=Path.Combine(Root,"artifacts/acceptance-7pages.pdf");Directory.CreateDirectory(Path.GetDirectoryName(output)!);service.Export(output);
        using var pdf=PdfReader.Open(output,PdfDocumentOpenMode.Import);Assert.Equal(7,pdf.PageCount);
        Assert.Equal(960,pdf.Pages[4].MediaBox.Width);Assert.Equal(540,pdf.Pages[4].MediaBox.Height);
        Assert.Empty(pdf.Pages[4].Contents.Elements);
        Assert.False(pdf.Pages[0].Elements.ContainsKey("/CropBox"));
        Assert.Throws<IOException>(()=>service.Export(path));Assert.Equal(hash,SHA256.HashData(File.ReadAllBytes(path)));
        Assert.False(service.State.IsDirty);
    }
    [Fact] public void MixedGeometrySurvivesExport()
    {
        using var service=new PdfService(Path.Combine(Root,"samples/PitchFlip-mixed.pdf"));service.State.InsertBlank(2);
        var g=service.State.Pages[1].Geometry;Assert.Equal(g,service.State.Pages[2].Geometry);
        var output=Path.Combine(Root,"artifacts/mixed-export.pdf");Directory.CreateDirectory(Path.GetDirectoryName(output)!);service.Export(output);
        using var pdf=PdfReader.Open(output,PdfDocumentOpenMode.Import);Assert.Equal(g.Rotation,pdf.Pages[2].Rotate);Assert.Equal(g.CropX1,pdf.Pages[2].CropBox.X1);
    }
    [Fact] public void InsertedBlankRetainsCroppedPageGeometry()
    {
        using var service=new PdfService(Path.Combine(Root,"samples/PitchFlip-mixed.pdf"));service.State.InsertBlank(3);
        var g=service.State.Pages[2].Geometry;
        Assert.NotEqual(g.X1,g.CropX1);Assert.Equal(g,service.State.Pages[3].Geometry);
        var output=Path.Combine(Root,"artifacts/cropped-export.pdf");Directory.CreateDirectory(Path.GetDirectoryName(output)!);service.Export(output);
        using var pdf=PdfReader.Open(output,PdfDocumentOpenMode.Import);
        Assert.Equal(g.CropX1,pdf.Pages[3].CropBox.X1);Assert.Equal(g.CropY2,pdf.Pages[3].CropBox.Y2);Assert.Equal(g.Width,pdf.Pages[3].MediaBox.Width);
    }
    [Fact] public void InvalidInputAndFailedExportDoNotLoseEdits()
    {
        Assert.Throws<FileNotFoundException>(()=>new PdfService(Path.Combine(Root,"absent.pdf")));
        using var service=new PdfService(Path.Combine(Root,"samples/PitchFlip-6pages.pdf"));service.State.InsertBlank(0);
        Assert.Throws<DirectoryNotFoundException>(()=>service.Export(Path.Combine(Root,"absent-dir/output.pdf")));Assert.True(service.State.IsDirty);
    }
}
