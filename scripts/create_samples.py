"""Generate deterministic software test fixtures (requires reportlab and PyMuPDF)."""
from pathlib import Path
from reportlab.pdfgen import canvas
import fitz

root = Path(__file__).resolve().parents[1]
out = root / 'samples'
out.mkdir(exist_ok=True)
for count in (6, 10, 200):
    c = canvas.Canvas(str(out / f'PitchFlip-{count}pages.pdf'), pagesize=(960, 540), invariant=True)
    for i in range(1, count+1):
        c.setFillColorRGB(.12,.25,.39)
        c.rect(0,490,960,50,fill=1,stroke=0)
        c.setFillColorRGB(1,1,1)
        c.setFont('Helvetica',16)
        c.drawString(35,509,'PITCHFLIP / PRINT PREVIEW TEST')
        c.setFillColorRGB(.14,.3,.46)
        c.setFont('Helvetica-Bold',72)
        c.drawString(60,285,f'Page {i}')
        c.setFont('Helvetica',22)
        c.drawString(64,225,'TOP EDGE - BIND HERE')
        c.setFont('Helvetica',14)
        c.drawString(64,60,f'Original page {i}  |  Landscape 16:9  |  Vector text')
        c.drawRightString(900,60,'BOTTOM EDGE')
        c.showPage()
    c.save()
doc=fitz.open(out/'PitchFlip-6pages.pdf')
doc[1].set_rotation(90)
doc[2].set_cropbox(fitz.Rect(20,20,920,500))
doc.save(out/'PitchFlip-mixed.pdf')
print('Created 6, 10, 200 page and mixed-geometry test fixtures.')
