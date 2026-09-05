namespace PitchFlip.Core;

public enum PageSlotType { Original, InsertedBlank, VirtualBlank }
public record PageGeometry(double X1, double Y1, double X2, double Y2,
    double CropX1, double CropY1, double CropX2, double CropY2, int Rotation)
{
    public double Width => X2 - X1;
    public double Height => Y2 - Y1;
}
public record PageSlot(Guid Id, PageSlotType Type, int? OriginalPageNumber, PageGeometry Geometry);
public record MappedPage(PageSlot Slot, int OutputPageNumber)
{
    public int SheetNumber => (OutputPageNumber + 1) / 2;
    public string Side => OutputPageNumber % 2 == 1 ? "正面" : "背面";
}
public record PhysicalSheet(int Number, MappedPage Front, MappedPage Back);

public sealed class DocumentState
{
    private record Snapshot(PageSlot[] Pages, int Selected);
    private readonly Stack<Snapshot> undo = new(), redo = new();
    private List<PageSlot> pages;
    private string savedSignature;
    public IReadOnlyList<PageSlot> Pages => pages.AsReadOnly();
    public int Selected { get; set; }
    public bool CanUndo => undo.Count > 0;
    public bool CanRedo => redo.Count > 0;
    private string Signature => string.Join(",", pages.Select(p => p.Id));
    public bool IsDirty => Signature != savedSignature;
    public DocumentState(IEnumerable<PageGeometry> geometry)
    {
        pages = geometry.Select((g,i) => new PageSlot(Guid.NewGuid(), PageSlotType.Original, i+1, g)).ToList();
        if (pages.Count == 0) throw new InvalidDataException("PDF 没有页面。");
        savedSignature = Signature;
    }
    public void MarkSaved() => savedSignature = Signature;
    private Snapshot Capture() => new(pages.ToArray(), Selected);
    private void Restore(Snapshot s) { pages = s.Pages.ToList(); Selected = s.Selected; }
    public string? InsertBlank(int index)
    {
        if (index < 0 || index > pages.Count) throw new ArgumentOutOfRangeException(nameof(index));
        undo.Push(Capture()); redo.Clear();
        var geometry = pages[index == 0 ? 0 : index-1].Geometry;
        var mixed = index > 0 && index < pages.Count && geometry != pages[index].Geometry;
        pages.Insert(index, new(Guid.NewGuid(), PageSlotType.InsertedBlank, null, geometry)); Selected = index;
        return mixed ? "相邻页面尺寸不同，空白页已沿用前一页尺寸。" : null;
    }
    public bool DeleteBlank(int index)
    {
        if (index < 0 || index >= pages.Count || pages[index].Type != PageSlotType.InsertedBlank) return false;
        undo.Push(Capture()); redo.Clear(); pages.RemoveAt(index); Selected = Math.Min(index, pages.Count-1); return true;
    }
    public void Undo() { if (undo.Count == 0) return; redo.Push(Capture()); Restore(undo.Pop()); }
    public void Redo() { if (redo.Count == 0) return; undo.Push(Capture()); Restore(redo.Pop()); }
    public MappedPage Map(int index) => new(pages[index], index+1);
    public IReadOnlyList<PhysicalSheet> Sheets => Enumerable.Range(0, (pages.Count+1)/2).Select(i =>
        new PhysicalSheet(i+1, Map(i*2), i*2+1 < pages.Count ? Map(i*2+1) :
            new(new(Guid.Empty, PageSlotType.VirtualBlank, null, pages[^1].Geometry), pages.Count+1))).ToArray();
}
