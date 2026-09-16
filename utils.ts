import makeWASocket, { DisconnectReason, useMultiFileAuthState, type WASocket } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import terminalQrcode from 'qrcode-terminal'
import { rm } from 'node:fs/promises'
import pino from 'pino'
import fs from 'fs'
const sleep = (ms: number): Promise<void> => {return new Promise((resolve) => setTimeout(resolve, ms));};

export async function verifySessions(){
    const caminho = './sessions'; 
    let sessoes: string[] = []
    
    const itens = await fs.readdir(caminho, { withFileTypes: true }, (err, itens) => {
      if (err) {
        console.error('Erro ao ler a pasta:', err);
        return;
      }
    let count:int = 0;
    itens.forEach(item => {
        if (item.isDirectory()) {
            count++;            
            sessoes.push(item.name);
        }
      });
    });
    
    return {sessoes}
}

