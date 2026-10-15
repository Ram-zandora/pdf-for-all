import type { ToolDef } from './types';
import * as org from './processors/organize';
import * as opt from './processors/optimize';
import * as to from './processors/convertTo';
import * as from from './processors/convertFrom';
import * as ed from './processors/edit';
import * as sec from './processors/security';
import { compareReport } from './processors/compare';
import OrganizeWorkspace from '../components/workspaces/OrganizeWorkspace';
import EditorWorkspace from '../components/workspaces/EditorWorkspace';
import CropWorkspace from '../components/workspaces/CropWorkspace';
import CompareWorkspace from '../components/workspaces/CompareWorkspace';
import HtmlWorkspace from '../components/workspaces/HtmlWorkspace';
import ScanUploader from '../components/workspaces/ScanUploader';

const PDF = { accept: 'application/pdf,.pdf', acceptLabel: 'PDF' };
const IMAGES = { accept: 'image/*,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tif,.tiff', acceptLabel: 'images' };

// Stroke icons drawn on a 24x24 grid.
const I = {
  merge: 'M4 4h6v7H4zM14 4h6v7h-6zM7 11v3a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-3M12 17v4M9.5 19l2.5 2.5 2.5-2.5',
  split: 'M4 3h7v18H4zM13 3h7v18h-7zM8 8l-2 4 2 4M16 8l2 4-2 4',
  remove: 'M6 3h9l4 4v14H6zM15 3v4h4M9.5 11.5l5 5M14.5 11.5l-5 5',
  extract: 'M6 3h9l4 4v14H6zM15 3v4h4M12.5 10v7M9.5 14l3 3 3-3',
  organize: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M3 12h18',
  compress: 'M6 3h12v18H6zM12 3v6M9.5 6.5 12 9l2.5-2.5M12 21v-6M9.5 17.5 12 15l2.5 2.5M9 12h6',
  repair: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.4-.4-2.4z',
  ocr: 'M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M8 16l4-9 4 9M9.5 13h5',
  jpg: 'M4 4h16v16H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1.5 1.5 0 1 0 0-.01',
  word: 'M6 3h9l4 4v14H6zM15 3v4h4M8.5 11l1.5 6 2-4.5 2 4.5 1.5-6',
  ppt: 'M6 3h9l4 4v14H6zM15 3v4h4M10 17v-6h2.5a2 2 0 0 1 0 4H10',
  excel: 'M6 3h9l4 4v14H6zM15 3v4h4M9.5 11l5 6M14.5 11l-5 6',
  html: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  pdfa: 'M6 3h9l4 4v14H6zM15 3v4h4M9 17l3-7 3 7M10.2 14.5h3.6',
  rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  numbers: 'M6 3h9l4 4v14H6zM15 3v4h4M10 12l2-1.5V17M10 17h4',
  watermark: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  crop: 'M6 2v16h16M2 6h16v16',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.5-2',
  protect: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
  sign: 'M3 17c3 0 4-9 6-9s0 9 2 9 2.5-4 4-4 1 3 2.5 3H21M3 21h18',
  redact: 'M6 3h9l4 4v14H6zM15 3v4h4M8.5 11h7v2.5h-7zM8.5 15.5h5',
  compare: 'M4 4h6v16H4zM14 4h6v16h-6zM12 2v20',
};

export const TOOLS: ToolDef[] = [
  /* ---------------------------- Organize ---------------------------- */
  {
    id: 'merge-pdf', title: 'Merge PDF', category: 'organize', color: '#e5322d', icon: I.merge, ...PDF,
    description: 'Combine PDFs in the order you want with the easiest PDF merger available.',
    multiple: true, minFiles: 2, action: 'Merge PDF', resultTitle: 'PDFs have been merged!', process: org.merge,
  },
  {
    id: 'split-pdf', title: 'Split PDF', category: 'organize', color: '#e5322d', icon: I.split, ...PDF,
    description: 'Separate one page or a whole set for easy conversion into independent PDF files.',
    multiple: false, action: 'Split PDF', resultTitle: 'PDF has been split!', process: org.split,
    defaults: { mode: 'range', ranges: '1-2', every: 1, mergeRanges: false },
    options: [
      { key: 'mode', label: 'Split mode', type: 'choice', choices: [
        { value: 'range', label: 'Custom ranges', hint: 'e.g. 1-3, 4-6, 9' },
        { value: 'fixed', label: 'Fixed ranges', hint: 'Every N pages' },
        { value: 'all', label: 'Extract all pages', hint: 'One PDF per page' },
      ] },
      { key: 'ranges', label: 'Page ranges', type: 'text', placeholder: '1-3, 5, 8-10', hint: 'Each range becomes a separate PDF', showIf: (o) => o.mode === 'range' },
      { key: 'mergeRanges', label: 'Merge all ranges into one PDF', type: 'checkbox', showIf: (o) => o.mode === 'range' },
      { key: 'every', label: 'Split every N pages', type: 'number', min: 1, showIf: (o) => o.mode === 'fixed' },
    ],
  },
  {
    id: 'remove-pages', title: 'Remove pages', category: 'organize', color: '#e5322d', icon: I.remove, ...PDF,
    description: 'Select and remove the PDF pages you don’t need. Get a new file without your deleted pages.',
    multiple: false, action: 'Remove pages', resultTitle: 'Pages have been removed!', process: org.removePages,
    defaults: { ranges: '1' },
    options: [{ key: 'ranges', label: 'Pages to remove', type: 'text', placeholder: '2, 5-7', hint: 'Use commas and dashes, e.g. 1, 3-4' }],
  },
  {
    id: 'extract-pages', title: 'Extract pages', category: 'organize', color: '#e5322d', icon: I.extract, ...PDF,
    description: 'Get a new document containing only the desired pages.',
    multiple: false, action: 'Extract pages', resultTitle: 'Pages have been extracted!', process: org.extractPages,
    defaults: { ranges: '1-2', separate: false },
    options: [
      { key: 'ranges', label: 'Pages to extract', type: 'text', placeholder: '1, 3-5' },
      { key: 'separate', label: 'Save each page as a separate PDF', type: 'checkbox' },
    ],
  },
  {
    id: 'organize-pdf', title: 'Organize PDF', category: 'organize', color: '#e5322d', icon: I.organize, ...PDF,
    description: 'Sort pages of your PDF file however you like. Delete, rotate or add pages to your document.',
    multiple: true, action: 'Organize', resultTitle: 'PDF has been organized!', process: org.organize,
    Workspace: OrganizeWorkspace, sidebar: true,
  },
  {
    id: 'scan-to-pdf', title: 'Scan to PDF', category: 'organize', color: '#e5322d', icon: I.scan, ...IMAGES,
    description: 'Capture document scans with your camera and turn them into a PDF instantly.',
    multiple: true, action: 'Create PDF', resultTitle: 'Your scan is ready!', process: to.scanToPdf, Uploader: ScanUploader,
    defaults: { filter: 'enhance', pageSize: 'a4', orientation: 'auto', margin: 'none' },
    options: [
      { key: 'filter', label: 'Scan filter', type: 'choice', choices: [
        { value: 'enhance', label: 'Auto enhance' }, { value: 'bw', label: 'Black & white' },
        { value: 'gray', label: 'Grayscale' }, { value: 'none', label: 'Original color' },
      ] },
      { key: 'pageSize', label: 'Page size', type: 'select', choices: [
        { value: 'a4', label: 'A4' }, { value: 'letter', label: 'US Letter' }, { value: 'fit', label: 'Same as image' },
      ] },
    ],
  },

  /* ---------------------------- Optimize ---------------------------- */
  {
    id: 'compress-pdf', title: 'Compress PDF', category: 'optimize', color: '#5ba53c', icon: I.compress, ...PDF,
    description: 'Reduce file size while optimizing for maximal PDF quality.',
    multiple: true, action: 'Compress PDF', resultTitle: 'PDFs have been compressed!', process: opt.compress,
    defaults: { level: 'recommended' },
    options: [{ key: 'level', label: 'Compression level', type: 'choice', choices: [
      { value: 'extreme', label: 'Extreme compression', hint: 'Less quality, high compression. Text becomes an image.' },
      { value: 'recommended', label: 'Recommended compression', hint: 'Good quality, good compression' },
      { value: 'low', label: 'Less compression', hint: 'Lossless: keeps text and quality intact' },
    ] }],
  },
  {
    id: 'repair-pdf', title: 'Repair PDF', category: 'optimize', color: '#5ba53c', icon: I.repair, ...PDF,
    description: 'Repair a damaged PDF and recover data from corrupt PDF. Fix PDF files with our Repair tool.',
    multiple: true, action: 'Repair PDF', resultTitle: 'PDFs have been repaired!', process: opt.repair,
  },
  {
    id: 'ocr-pdf', title: 'OCR PDF', category: 'optimize', color: '#5ba53c', icon: I.ocr,
    accept: 'application/pdf,.pdf,image/*', acceptLabel: 'PDF or image',
    description: 'Easily convert scanned PDF into searchable and selectable documents.',
    multiple: true, action: 'OCR PDF', resultTitle: 'Your PDF is now searchable!', process: opt.ocr,
    defaults: { language: 'eng' },
    options: [{ key: 'language', label: 'Document language', type: 'select', choices: [
      { value: 'eng', label: 'English' }, { value: 'spa', label: 'Spanish' }, { value: 'fra', label: 'French' },
      { value: 'deu', label: 'German' }, { value: 'ita', label: 'Italian' }, { value: 'por', label: 'Portuguese' },
      { value: 'nld', label: 'Dutch' }, { value: 'rus', label: 'Russian' }, { value: 'hin', label: 'Hindi' },
      { value: 'tam', label: 'Tamil' }, { value: 'tel', label: 'Telugu' }, { value: 'ara', label: 'Arabic' },
      { value: 'chi_sim', label: 'Chinese (Simplified)' }, { value: 'jpn', label: 'Japanese' }, { value: 'kor', label: 'Korean' },
      { value: 'eng+spa+fra+deu', label: 'Mixed (EN/ES/FR/DE)' },
    ] }],
  },

  /* -------------------------- Convert to PDF ------------------------- */
  {
    id: 'jpg-to-pdf', title: 'JPG to PDF', category: 'convert-to', color: '#f0c419', icon: I.jpg, ...IMAGES,
    description: 'Convert JPG images to PDF in seconds. Easily adjust orientation and margins.',
    multiple: true, action: 'Convert to PDF', resultTitle: 'Images have been converted to PDF!', process: to.imagesToPdf,
    defaults: { orientation: 'auto', pageSize: 'a4', margin: 'none', merge: true },
    options: [
      { key: 'orientation', label: 'Page orientation', type: 'choice', choices: [
        { value: 'auto', label: 'Auto' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' },
      ], showIf: (o) => o.pageSize !== 'fit' },
      { key: 'pageSize', label: 'Page size', type: 'select', choices: [
        { value: 'fit', label: 'Fit (same page size as image)' }, { value: 'a4', label: 'A4 (297x210 mm)' },
        { value: 'letter', label: 'US Letter (215x279.4 mm)' }, { value: 'legal', label: 'US Legal' }, { value: 'a3', label: 'A3' }, { value: 'a5', label: 'A5' },
      ] },
      { key: 'margin', label: 'Margin', type: 'choice', choices: [
        { value: 'none', label: 'No margin' }, { value: 'small', label: 'Small' }, { value: 'big', label: 'Big' },
      ] },
      { key: 'merge', label: 'Merge all images in one PDF file', type: 'checkbox' },
    ],
  },
  {
    id: 'word-to-pdf', title: 'WORD to PDF', category: 'convert-to', color: '#2b579a', icon: I.word,
    accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', acceptLabel: 'WORD',
    description: 'Make DOCX files easy to read by converting them to PDF.',
    multiple: true, action: 'Convert to PDF', resultTitle: 'WORD documents have been converted!', process: to.wordToPdf,
    defaults: { pageSize: 'a4', orientation: 'portrait' },
    options: [
      { key: 'pageSize', label: 'Page size', type: 'select', choices: [{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'US Letter' }, { value: 'legal', label: 'US Legal' }] },
      { key: 'orientation', label: 'Orientation', type: 'choice', choices: [{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }] },
    ],
  },
  {
    id: 'powerpoint-to-pdf', title: 'POWERPOINT to PDF', category: 'convert-to', color: '#d24726', icon: I.ppt,
    accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation', acceptLabel: 'POWERPOINT',
    description: 'Make PPTX slideshows easy to view by converting them to PDF.',
    multiple: true, action: 'Convert to PDF', resultTitle: 'Presentations have been converted!', process: to.pptToPdf,
  },
  {
    id: 'excel-to-pdf', title: 'EXCEL to PDF', category: 'convert-to', color: '#217346', icon: I.excel,
    accept: '.xlsx,.xls,.csv,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv', acceptLabel: 'EXCEL',
    description: 'Make EXCEL spreadsheets easy to read by converting them to PDF.',
    multiple: true, action: 'Convert to PDF', resultTitle: 'Spreadsheets have been converted!', process: to.excelToPdf,
    defaults: { pageSize: 'a4', orientation: 'landscape' },
    options: [
      { key: 'pageSize', label: 'Page size', type: 'select', choices: [{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'US Letter' }, { value: 'a3', label: 'A3' }] },
      { key: 'orientation', label: 'Orientation', type: 'choice', choices: [{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }] },
    ],
  },
  {
    id: 'html-to-pdf', title: 'HTML to PDF', category: 'convert-to', color: '#f0c419', icon: I.html,
    accept: '.html,.htm,text/html', acceptLabel: 'HTML',
    description: 'Convert webpages in HTML to PDF. Paste HTML, upload a saved page, or try a URL.',
    multiple: true, minFiles: 0, action: 'Convert to PDF', resultTitle: 'Webpage has been converted!', process: to.htmlToPdf,
    Workspace: HtmlWorkspace, sidebar: true,
    defaults: { source: 'html', url: '', html: '', pageSize: 'a4', orientation: 'portrait', margin: 'small' },
    options: [
      { key: 'pageSize', label: 'Page size', type: 'select', choices: [{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'US Letter' }, { value: 'a3', label: 'A3' }] },
      { key: 'orientation', label: 'Orientation', type: 'choice', choices: [{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }] },
      { key: 'margin', label: 'Margin', type: 'choice', choices: [{ value: 'none', label: 'No margin' }, { value: 'small', label: 'Small' }, { value: 'big', label: 'Big' }] },
    ],
  },

  /* ------------------------- Convert from PDF ------------------------ */
  {
    id: 'pdf-to-jpg', title: 'PDF to JPG', category: 'convert-from', color: '#f0c419', icon: I.jpg, ...PDF,
    description: 'Convert each PDF page into a JPG or extract all images contained in a PDF.',
    multiple: true, action: 'Convert to JPG', resultTitle: 'PDF has been converted to images!', process: from.pdfToImages,
    defaults: { mode: 'pages', quality: 'normal', format: 'jpg' },
    options: [
      { key: 'mode', label: 'Mode', type: 'choice', choices: [
        { value: 'pages', label: 'Page to JPG', hint: 'Every page will be converted into an image' },
        { value: 'extract', label: 'Extract images', hint: 'All embedded images will be extracted' },
      ] },
      { key: 'quality', label: 'Image quality', type: 'choice', choices: [{ value: 'normal', label: 'Normal (150 DPI)' }, { value: 'high', label: 'High (300 DPI)' }], showIf: (o) => o.mode === 'pages' },
      { key: 'format', label: 'Format', type: 'choice', choices: [{ value: 'jpg', label: 'JPG' }, { value: 'png', label: 'PNG' }] },
    ],
  },
  {
    id: 'pdf-to-word', title: 'PDF to WORD', category: 'convert-from', color: '#2b579a', icon: I.word, ...PDF,
    description: 'Easily convert your PDF files into easy to edit DOCX documents.',
    multiple: true, action: 'Convert to WORD', resultTitle: 'PDF has been converted to WORD!', process: from.pdfToWord,
    defaults: { mode: 'text' },
    options: [{ key: 'mode', label: 'Conversion', type: 'choice', choices: [
      { value: 'text', label: 'Editable text', hint: 'Text you can edit in Word' },
      { value: 'layout', label: 'Exact layout', hint: 'Pages look identical, not editable' },
    ] }],
  },
  {
    id: 'pdf-to-powerpoint', title: 'PDF to POWERPOINT', category: 'convert-from', color: '#d24726', icon: I.ppt, ...PDF,
    description: 'Turn your PDF files into easy to edit PPTX slideshows.',
    multiple: true, action: 'Convert to PPTX', resultTitle: 'PDF has been converted to POWERPOINT!', process: from.pdfToPowerPoint,
  },
  {
    id: 'pdf-to-excel', title: 'PDF to EXCEL', category: 'convert-from', color: '#217346', icon: I.excel, ...PDF,
    description: 'Pull data straight from PDFs into EXCEL spreadsheets in a few short seconds.',
    multiple: true, action: 'Convert to EXCEL', resultTitle: 'PDF has been converted to EXCEL!', process: from.pdfToExcel,
    defaults: { sheets: 'per-page' },
    options: [{ key: 'sheets', label: 'Worksheets', type: 'choice', choices: [
      { value: 'per-page', label: 'One sheet per page' }, { value: 'single', label: 'Everything in one sheet' },
    ] }],
  },
  {
    id: 'pdf-to-pdfa', title: 'PDF to PDF/A', category: 'convert-from', color: '#1d6fb8', icon: I.pdfa, ...PDF,
    description: 'Transform your PDF to PDF/A, the ISO-standardized version of PDF for long-term archiving.',
    multiple: true, action: 'Convert to PDF/A', resultTitle: 'PDF has been converted to PDF/A!', process: opt.toPdfA,
    defaults: { conformance: '2B' },
    options: [{ key: 'conformance', label: 'Conformance level', type: 'choice', choices: [
      { value: '1B', label: 'PDF/A-1b' }, { value: '2B', label: 'PDF/A-2b', hint: 'Recommended' }, { value: '3B', label: 'PDF/A-3b' },
    ] }],
  },

  /* ------------------------------ Edit ------------------------------ */
  {
    id: 'rotate-pdf', title: 'Rotate PDF', category: 'edit', color: '#a259d9', icon: I.rotate, ...PDF,
    description: 'Rotate your PDFs the way you need them. You can even rotate multiple PDFs at once!',
    multiple: true, action: 'Rotate PDF', resultTitle: 'PDFs have been rotated!', process: org.rotate,
    defaults: { angle: '90', which: 'all', ranges: '1' },
    options: [
      { key: 'angle', label: 'Rotation', type: 'choice', choices: [
        { value: '90', label: 'Right 90°' }, { value: '-90', label: 'Left 90°' }, { value: '180', label: '180°' },
      ] },
      { key: 'which', label: 'Pages', type: 'select', choices: [
        { value: 'all', label: 'All pages' }, { value: 'odd', label: 'Odd pages' }, { value: 'even', label: 'Even pages' }, { value: 'range', label: 'Custom range' },
      ] },
      { key: 'ranges', label: 'Page range', type: 'text', placeholder: '1-3, 7', showIf: (o) => o.which === 'range' },
    ],
  },
  {
    id: 'add-page-numbers', title: 'Add page numbers', category: 'edit', color: '#a259d9', icon: I.numbers, ...PDF,
    description: 'Add page numbers into PDFs with ease. Choose your positions, dimensions, typography.',
    multiple: true, action: 'Add page numbers', resultTitle: 'Page numbers have been added!', process: ed.pageNumbers,
    defaults: { position: 'bottom-center', margin: 'recommended', start: 1, pages: '', format: '{n}', font: 'Helvetica', fontSize: 12, color: '#000000', bold: false, facing: false },
    options: [
      { key: 'position', label: 'Position', type: 'select', choices: [
        { value: 'top-left', label: 'Top left' }, { value: 'top-center', label: 'Top center' }, { value: 'top-right', label: 'Top right' },
        { value: 'bottom-left', label: 'Bottom left' }, { value: 'bottom-center', label: 'Bottom center' }, { value: 'bottom-right', label: 'Bottom right' },
      ] },
      { key: 'facing', label: 'Facing pages (mirror left/right)', type: 'checkbox' },
      { key: 'margin', label: 'Margin', type: 'choice', choices: [{ value: 'small', label: 'Small' }, { value: 'recommended', label: 'Recommended' }, { value: 'big', label: 'Big' }] },
      { key: 'format', label: 'Text', type: 'select', choices: [
        { value: '{n}', label: 'Page number only (1)' }, { value: 'Page {n}', label: 'Page {n}' }, { value: 'Page {n} of {p}', label: 'Page {n} of {p}' }, { value: '{n} / {p}', label: '{n} / {p}' }, { value: '- {n} -', label: '- {n} -' },
      ] },
      { key: 'start', label: 'First number', type: 'number', min: 0 },
      { key: 'pages', label: 'Pages to number', type: 'text', placeholder: 'All pages (or e.g. 2-10)' },
      { key: 'font', label: 'Font', type: 'select', choices: [{ value: 'Helvetica', label: 'Helvetica' }, { value: 'Times', label: 'Times New Roman' }, { value: 'Courier', label: 'Courier' }] },
      { key: 'fontSize', label: 'Font size', type: 'range', min: 6, max: 36, unit: 'pt' },
      { key: 'bold', label: 'Bold', type: 'checkbox' },
      { key: 'color', label: 'Color', type: 'color' },
    ],
  },
  {
    id: 'add-watermark', title: 'Add watermark', category: 'edit', color: '#a259d9', icon: I.watermark, ...PDF,
    description: 'Stamp an image or text over your PDF in seconds. Choose the typography, transparency and position.',
    multiple: true, action: 'Add watermark', resultTitle: 'Watermark has been added!', process: ed.watermark,
    defaults: { type: 'text', text: 'CONFIDENTIAL', font: 'Helvetica', fontSize: 48, color: '#e5322d', bold: true, italic: false, opacity: 40, rotation: 45, position: 'center', pages: '', imageScale: 50 },
    options: [
      { key: 'type', label: 'Watermark type', type: 'choice', choices: [{ value: 'text', label: 'Place text' }, { value: 'image', label: 'Place image' }] },
      { key: 'text', label: 'Text', type: 'text', showIf: (o) => o.type === 'text' },
      { key: 'font', label: 'Font', type: 'select', choices: [{ value: 'Helvetica', label: 'Helvetica' }, { value: 'Times', label: 'Times New Roman' }, { value: 'Courier', label: 'Courier' }], showIf: (o) => o.type === 'text' },
      { key: 'fontSize', label: 'Font size', type: 'range', min: 8, max: 160, unit: 'pt', showIf: (o) => o.type === 'text' },
      { key: 'bold', label: 'Bold', type: 'checkbox', showIf: (o) => o.type === 'text' },
      { key: 'italic', label: 'Italic', type: 'checkbox', showIf: (o) => o.type === 'text' },
      { key: 'color', label: 'Color', type: 'color', showIf: (o) => o.type === 'text' },
      { key: 'image', label: 'Image', type: 'image', showIf: (o) => o.type === 'image' },
      { key: 'imageScale', label: 'Image size', type: 'range', min: 5, max: 200, unit: '%', showIf: (o) => o.type === 'image' },
      { key: 'position', label: 'Position', type: 'select', choices: [
        { value: 'center', label: 'Center' }, { value: 'mosaic', label: 'Mosaic (tile across page)' },
        { value: 'top-left', label: 'Top left' }, { value: 'top-center', label: 'Top center' }, { value: 'top-right', label: 'Top right' },
        { value: 'middle-left', label: 'Middle left' }, { value: 'middle-right', label: 'Middle right' },
        { value: 'bottom-left', label: 'Bottom left' }, { value: 'bottom-center', label: 'Bottom center' }, { value: 'bottom-right', label: 'Bottom right' },
      ] },
      { key: 'opacity', label: 'Transparency', type: 'range', min: 5, max: 100, unit: '%' },
      { key: 'rotation', label: 'Rotation', type: 'select', choices: [
        { value: '0', label: 'Do not rotate' }, { value: '45', label: '45°' }, { value: '90', label: '90°' }, { value: '-45', label: '-45°' }, { value: '180', label: '180°' },
      ] },
      { key: 'pages', label: 'Pages', type: 'text', placeholder: 'All pages (or e.g. 1-5)' },
    ],
  },
  {
    id: 'crop-pdf', title: 'Crop PDF', category: 'edit', color: '#a259d9', icon: I.crop, ...PDF,
    description: 'Crop margins of PDF documents or select specific areas, then apply to one page or the whole document.',
    multiple: false, action: 'Crop PDF', resultTitle: 'PDF has been cropped!', process: ed.cropPdf,
    Workspace: CropWorkspace, sidebar: true, defaults: { scope: 'all' },
    options: [{ key: 'scope', label: 'Apply to', type: 'choice', choices: [{ value: 'all', label: 'All pages' }, { value: 'current', label: 'Current page only' }] }],
  },
  {
    id: 'edit-pdf', title: 'Edit PDF', category: 'edit', color: '#a259d9', icon: I.edit, ...PDF, isNew: true,
    description: 'Add text, images, shapes or freehand annotations to a PDF document. Edit size, font and color.',
    multiple: false, action: 'Save changes', resultTitle: 'Changes have been saved!', process: ed.editPdf,
    Workspace: EditorWorkspace, sidebar: false,
  },

  /* ---------------------------- Security ---------------------------- */
  {
    id: 'unlock-pdf', title: 'Unlock PDF', category: 'security', color: '#3b82c4', icon: I.unlock, ...PDF,
    description: 'Remove PDF password security, giving you the freedom to use your PDFs as you want.',
    multiple: true, action: 'Unlock PDF', resultTitle: 'PDFs have been unlocked!', process: sec.unlock,
    defaults: { password: '' },
    options: [{ key: 'password', label: 'Password (if the file needs one to open)', type: 'password', placeholder: 'Leave empty for owner-locked files' }],
  },
  {
    id: 'protect-pdf', title: 'Protect PDF', category: 'security', color: '#3b82c4', icon: I.protect, ...PDF,
    description: 'Protect PDF files with a password. Encrypt PDF documents to prevent unauthorized access.',
    multiple: true, action: 'Protect PDF', resultTitle: 'PDFs have been protected!', process: sec.protect,
    defaults: { password: '', repeat: '', ownerPassword: '', allowPrint: true, allowCopy: false, allowEdit: false },
    validate: ({ options }) =>
      !options.password ? 'Please enter a password' : options.password !== options.repeat ? 'Passwords do not match' : null,
    options: [
      { key: 'password', label: 'Type password', type: 'password' },
      { key: 'repeat', label: 'Repeat password', type: 'password' },
      { key: 'ownerPassword', label: 'Owner password (optional)', type: 'password', placeholder: 'Same as above' },
      { key: 'allowPrint', label: 'Allow printing', type: 'checkbox' },
      { key: 'allowCopy', label: 'Allow copying text', type: 'checkbox' },
      { key: 'allowEdit', label: 'Allow editing', type: 'checkbox' },
    ],
  },
  {
    id: 'sign-pdf', title: 'Sign PDF', category: 'security', color: '#3b82c4', icon: I.sign, ...PDF,
    description: 'Sign yourself: draw, type or upload your signature and place it anywhere on the document.',
    multiple: false, action: 'Sign', resultTitle: 'Document has been signed!', process: ed.signPdf,
    Workspace: EditorWorkspace, sidebar: false,
  },
  {
    id: 'redact-pdf', title: 'Redact PDF', category: 'security', color: '#3b82c4', icon: I.redact, ...PDF, isNew: true,
    description: 'Permanently remove sensitive text and graphics from your PDF. Redacted areas are flattened for good.',
    multiple: false, action: 'Redact', resultTitle: 'PDF has been redacted!', process: ed.redactPdf,
    Workspace: EditorWorkspace, sidebar: false,
  },
  {
    id: 'compare-pdf', title: 'Compare PDF', category: 'security', color: '#3b82c4', icon: I.compare, ...PDF, isNew: true,
    description: 'Show a side-by-side document comparison and easily spot changes between two file versions.',
    multiple: true, minFiles: 2, action: 'Download report', resultTitle: 'Comparison report is ready!', process: compareReport,
    Workspace: CompareWorkspace, sidebar: false,
  },
];

export const toolById = (id: string | undefined) => TOOLS.find((t) => t.id === id);
