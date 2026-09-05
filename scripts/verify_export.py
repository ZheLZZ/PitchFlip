"""Independent validation with a different PDF engine than the exporter."""
from pathlib import Path
import fitz

root=Path(__file__).resolve().parents[1]
original=fitz.open(root/'samples/PitchFlip-6pages.pdf')
exported=fitz.open(root/'artifacts/acceptance-7pages.pdf')
assert len(exported)==7
assert exported[4].get_text().strip()==''
assert not exported[4].get_images()
for i,j in enumerate([0,1,2,3,5,6]):
    a,b=original[i],exported[j]
    assert a.get_text()==b.get_text(), f'Text mismatch: {i+1}'
    assert b''.join(original.xref_stream(x) for x in a.get_contents())==b''.join(exported.xref_stream(x) for x in b.get_contents()), f'Content stream changed: {i+1}'
    assert a.get_images()==b.get_images()
    x,y=a.get_pixmap().samples,b.get_pixmap().samples
    assert len(x)==len(y)
    # PDFsharp adds a transparency group; renderer rounding can differ by 2/255.
    diffs=[abs(v-w) for v,w in zip(x,y)]
    assert max(diffs)<=2 and sum(diffs)/len(diffs)<0.1, f'Render mismatch: {i+1}'
print('PASS: 7 pages; blank empty; original text/content streams unchanged; rendered pages agree within 2/255 color rounding.')
