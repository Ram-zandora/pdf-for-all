import { openPdfJs, openPdfLib, pdfBlob, readBytes, withSuffix, type OutputFile } from '../../lib/pdf';
import { PDFDocument } from '@cantoo/pdf-lib';
import type { ProcessContext } from '../types';
import { rasterize } from './optimize';

export async function protect({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const outputs: OutputFile[] = [];
  for (let f = 0; f < files.length; f++) {
    progress(f / files.length, `Encrypting ${files[f].name}`);
    const doc = await openPdfLib(files[f]);
    if (doc.isEncrypted) throw new Error(`${files[f].name} is already protected. Unlock it first.`);
    doc.encrypt({
      userPassword: options.password,
      ownerPassword: options.ownerPassword || options.password,
      permissions: {
        printing: options.allowPrint ? 'highResolution' : false,
        copying: !!options.allowCopy,
        modifying: !!options.allowEdit,
        annotating: !!options.allowEdit,
        fillingForms: true,
        contentAccessibility: true,
        documentAssembly: !!options.allowEdit,
      },
    });
    outputs.push({ name: withSuffix(files[f].name, '_protected'), blob: pdfBlob(await doc.save()) });
  }
  return outputs;
}

export async function unlock({ files, options, progress }: ProcessContext): Promise<OutputFile[]> {
  const outputs: OutputFile[] = [];
  for (let f = 0; f < files.length; f++) {
    const file = files[f];
    progress(f / files.length, `Unlocking ${file.name}`);
    const password: string = options.password || '';
    // Make sure the password is right first; pdf.js gives a clear error for this.
    try {
      const probe = await openPdfJs(file, password);
      await probe.destroy();
    } catch (e) {
      const name = (e as { name?: string }).name;
      if (name === 'PasswordException') throw new Error(password ? `Incorrect password for ${file.name}` : `${file.name} needs a password to open`);
      throw e;
    }
    let bytes: Uint8Array;
    try {
      const doc = await PDFDocument.load(await readBytes(file), { password });
      const out = await PDFDocument.create();
      (await out.copyPages(doc, doc.getPageIndices())).forEach((p) => out.addPage(p));
      bytes = await out.save();
    } catch {
      // Unsupported encryption handler: fall back to rebuilding pages from images.
      bytes = await rasterize(file, { dpi: 200, quality: 0.9, password });
    }
    outputs.push({ name: withSuffix(file.name, '_unlocked'), blob: pdfBlob(bytes) });
  }
  return outputs;
}
