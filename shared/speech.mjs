export const MAX_SPEECH_TEXT=5000;
export const MAX_REFERENCE_BYTES=3_000_000;
export const DEFAULT_SPEECH_SETTINGS={engine:'cosyvoice3',endpoint:'http://127.0.0.1:50000',sampleRate:24000,voiceId:null,systemVoice:'',rate:1,volume:1};
export function speechChunks(value,limit=180){
  const text=String(value||'').replace(/\r\n?/g,'\n').trim();
  if(!text)throw new Error('请先选中要朗读的文字');
  if([...text].length>MAX_SPEECH_TEXT)throw new Error(`一次最多朗读 ${MAX_SPEECH_TEXT} 字，请分段选择`);
  const result=[];let chunk='';
  for(const char of text){chunk+=char;if([...chunk].length>=limit||(/[。！？!?；;\n]/u.test(char)&&chunk.trim())){result.push(chunk.trim());chunk='';}}
  if(chunk.trim())result.push(chunk.trim());return result;
}
