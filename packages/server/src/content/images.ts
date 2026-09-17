import 'server-only';
import sharp from 'sharp';
import { TradingError } from '../tradara/contracts';
/** Decode and re-encode public editorial images: rejects SVG, malformed files and decompression bombs; strips metadata. */
export async function normalizeImage(bytes: Uint8Array) {
  if(bytes.length>4194304 || !bytes.length) throw new TradingError('invalid_image_size',413);
  try {
    const source=sharp(bytes,{animated:true,limitInputPixels:16000000,failOn:'warning'});
    const meta=await source.metadata();
    const frames=meta.pages??1;
    if(!['png','jpeg','webp','gif'].includes(meta.format??'') || frames>100
      || !meta.width || !meta.height || meta.width*(meta.pageHeight??meta.height)*frames>16000000) throw new Error();
    const data=await source.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
    if(data.length>4194304)throw new Error();
    return {data,mime:'image/webp' as const};
  } catch {throw new TradingError('invalid_image');}
}
