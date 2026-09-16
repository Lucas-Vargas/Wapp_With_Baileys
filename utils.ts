import {getStatus} from './wappFunctions.ts'
import fs from 'fs/promises'
const sleep = (ms: number): Promise<void> => {return new Promise((resolve) => setTimeout(resolve, ms));};


export async function verifySessions(){
  const caminho = './sessions'; 
  let sessoes: {directory:string, status:string}[] = []

  const itens = await fs.readdir(caminho, {withFileTypes: true});
  for (const item of itens) {
    if (item.isDirectory()) {
        let sessionStatus = await getStatus(item.name) 
        sessoes.push({directory: item.name, status: sessionStatus});
    }
  };
  return sessoes
}