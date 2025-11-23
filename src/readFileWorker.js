import fs from 'fs';


export async function readJson(path) {
  //console.log(path)
  const data = fs.readFileSync(path, 'utf-8'); //await fs.promises.readFile
  return JSON.parse(data);
}
export async function readFiles(path) {
  //console.log(path)
  const buf = fs.readFileSync(path);

  return buf;
}