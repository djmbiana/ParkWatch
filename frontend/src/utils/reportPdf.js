// Client-side PDF generation for a citizen's own report — lets them archive
// a copy outside the app. No backend involved; built entirely from the same
// `report` object the detail page already has in memory.
import { jsPDF } from 'jspdf'
import { formatDateTime, formatPenalty } from './format'

const BRAND_GREEN = [61, 160, 68]   // #3DA044
const TEXT_DARK = [15, 17, 23]      // #0F1117
const TEXT_MUTED = [107, 114, 128]  // #6B7280
const BORDER = [229, 231, 235]      // #E5E7EB

const STATUS_LABELS = {
  pending: 'Pending', verified: 'Verified', acknowledged: 'Acknowledged',
  dispatched: 'Dispatched', resolved: 'Resolved', rejected: 'Declined',
  escalated: 'Escalated', contested: 'Under Review',
}

// Loads an image URL into a data URL via an offscreen canvas so it can be
// embedded with jsPDF's addImage. The caller must pass a same-origin (or
// CORS-permissive) URL — a GCS presigned URL fetched directly would taint
// the canvas and make toDataURL throw, since the bucket sends no CORS
// headers for our origin. ReportDetail.jsx routes this through our own
// backend (citizen.getPhotoUrl) precisely to avoid that. If loading still
// fails for any reason, we resolve(null) and the PDF is generated anyway,
// just without the photo.
function loadImageAsDataUrl(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const timeout = setTimeout(() => resolve(null), 12000)
    img.onload = () => {
      clearTimeout(timeout)
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), w: img.naturalWidth, h: img.naturalHeight })
      } catch {
        resolve(null) // tainted canvas (no CORS) — skip embedding
      }
    }
    img.onerror = () => { clearTimeout(timeout); resolve(null) }
    img.src = url
  })
}

export async function downloadReportPdf(report, { photoUrl } = {}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40

  // Header band
  doc.setFillColor(...BRAND_GREEN)
  doc.rect(0, 0, pageW, 74, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('ParkWatch', margin, 34)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Official Violation Report Record', margin, 52)

  const statusLabel = STATUS_LABELS[report.status] ?? report.status ?? '-'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  const rptLabel = `RPT-${report.report_id}`
  doc.text(rptLabel, pageW - margin, 34, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(statusLabel.toUpperCase(), pageW - margin, 52, { align: 'right' })

  let y = 100

  // Plate number, large and centered
  const plate = report.ocr_extracted_plate || report.manual_plate_input
  if (plate) {
    doc.setTextColor(...TEXT_MUTED)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('PLATE NUMBER', pageW / 2, y, { align: 'center' })
    y += 22
    doc.setTextColor(...BRAND_GREEN)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(28)
    doc.text(plate, pageW / 2, y, { align: 'center' })
    y += 16
    const subline = [report.street?.street_name, report.street?.barangay_name, report.violation_type].filter(Boolean).join(' · ')
    if (subline) {
      doc.setTextColor(...TEXT_MUTED)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.text(subline, pageW / 2, y, { align: 'center' })
    }
    y += 30
  }

  // Details table
  const rows = [
    ['Plate Source', report.ocr_extracted_plate ? 'Read by OCR' : report.manual_plate_input ? 'Entered manually' : '-'],
    ['Street', report.street?.street_name ?? '-'],
    ['Barangay', report.street?.barangay_name ?? '-'],
    ['Violation Type', report.violation_type ?? '-'],
    ['Submitted', formatDateTime(report.submitted_at) ?? '-'],
    // jsPDF's base Helvetica font has no glyph for "₱" (renders as "±"), so
    // substitute the ASCII-safe "PHP" prefix used elsewhere for PDF/print output.
    ['Penalty', formatPenalty(report.penalty_tier).replace('₱', 'PHP ')],
  ]
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.75)
  const rowH = 24
  doc.line(margin, y, pageW - margin, y)
  for (const [label, value] of rows) {
    y += rowH
    doc.setTextColor(...TEXT_MUTED)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(label, margin, y - 8)
    doc.setTextColor(...TEXT_DARK)
    doc.setFont('helvetica', 'bold')
    // No maxWidth here — combining it with align:'right' makes jsPDF justify
    // the line by stretching letter-spacing (even when the text already
    // fits), which is what produced the "3 r d   O f f e n s e" garbling.
    // These values are short, fixed-format strings that never need wrapping.
    doc.text(String(value), pageW - margin, y - 8, { align: 'right' })
    doc.setDrawColor(...BORDER)
    doc.line(margin, y, pageW - margin, y)
  }
  y += 30

  // Decline reason
  if ((report.status === 'rejected' || report.status === 'contested') && report.rejection_reason) {
    y = drawNoteBox(doc, y, margin, pageW, 'REASON DECLINED', report.rejection_reason, [254, 242, 242], [153, 27, 27])
  }

  // Appeal verdict
  if (report.appeal && report.appeal.status !== 'pending') {
    const overturned = report.appeal.status === 'overturned'
    const title = `APPEAL ${overturned ? 'OVERTURNED' : 'UPHELD'}`
    const body = report.appeal.verdict_notes || (overturned ? 'Your appeal was granted.' : 'Your appeal was not granted.')
    y = drawNoteBox(doc, y, margin, pageW, title, body, overturned ? [236, 253, 245] : [254, 242, 242], overturned ? [6, 95, 70] : [153, 27, 27])
  }

  // Evidence photo — best effort, PDF still generates if this fails. Prefer
  // the same-origin proxy URL (photoUrl) so the canvas isn't CORS-tainted;
  // report.photo_url is a GCS presigned URL and will fail to embed.
  const sourcePhotoUrl = photoUrl || report.photo_url
  if (sourcePhotoUrl) {
    const img = await loadImageAsDataUrl(sourcePhotoUrl)
    const spaceLeft = doc.internal.pageSize.getHeight() - y - 60
    if (img && spaceLeft > 100) {
      doc.setTextColor(...TEXT_MUTED)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('EVIDENCE PHOTO', margin, y + 14)
      y += 22
      const maxW = pageW - margin * 2
      const maxH = Math.min(spaceLeft - 22, 260)
      const ratio = Math.min(maxW / img.w, maxH / img.h)
      const w = img.w * ratio
      const h = img.h * ratio
      doc.addImage(img.dataUrl, 'JPEG', margin, y, w, h)
    } else if (!img) {
      doc.setTextColor(...TEXT_MUTED)
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.text('Evidence photo is available in the ParkWatch app (not embeddable in this PDF).', margin, y + 14)
    }
  }

  // Footer
  const pageH = doc.internal.pageSize.getHeight()
  doc.setDrawColor(...BORDER)
  doc.line(margin, pageH - 40, pageW - margin, pageH - 40)
  doc.setTextColor(...TEXT_MUTED)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Generated ${new Date().toLocaleString('en-PH')} · ParkWatch — for personal archival purposes.`, margin, pageH - 26)

  doc.save(`ParkWatch-Report-RPT-${report.report_id}.pdf`)
}

function drawNoteBox(doc, y, margin, pageW, title, body, bgColor, textColor) {
  const boxW = pageW - margin * 2
  const lines = doc.splitTextToSize(body, boxW - 24)
  const boxH = 34 + lines.length * 13
  doc.setFillColor(...bgColor)
  doc.roundedRect(margin, y, boxW, boxH, 6, 6, 'F')
  doc.setTextColor(...textColor)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(title, margin + 12, y + 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(lines, margin + 12, y + 34)
  return y + boxH + 16
}
