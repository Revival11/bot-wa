const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

const gameState = new Map(); // userID -> { game: 'tebak', number: 5 }

async function startBot() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            try {
                const { connection, lastDisconnect } = update;
                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('Connection closed. Reconnecting:', shouldReconnect);
                    if (shouldReconnect) {
                        startBot();
                    }
                } else if (connection === 'open') {
                    console.log('Bot connected to WhatsApp');
                }
            } catch (err) {
                console.error('Error in connection.update:', err);
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            try {
                const msg = messages[0];
                if (!msg.message || msg.key.fromMe) return;

                const from = msg.key.remoteJid;
                const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim().toLowerCase();

                // Mini Game Logic
                if (gameState.has(from)) {
                    const session = gameState.get(from);

                    // === Tebak Angka ===
                    if (session.game === 'tebak') {
                        const guess = parseInt(text);
                        if (isNaN(guess)) {
                            await sock.sendMessage(from, { text: 'Masukin angka dong brooo!' });
                        } else if (guess === session.number) {
                            await sock.sendMessage(from, { text: `Mantap! Jawaban kamu bener (${session.number})` });
                            gameState.delete(from);
                        } else {
                            await sock.sendMessage(from, { text: guess < session.number ? 'Kekecilan...' : 'Kebesaran...' });
                        }
                        return;
                    }

                    // === Quiz Cepat ===
                    if (session.game === 'quiz') {
                        const jawab = text;
                        if (jawab === session.answer.toLowerCase()) {
                            await sock.sendMessage(from, { text: 'Bener banget! Kamu pinter!' });
                            gameState.delete(from);
                        } else {
                            await sock.sendMessage(from, { text: 'Salah bro, coba lagi!' });
                        }
                        return;
                    }
                }

                // Menu awal
                if (text === 'p') {
                    await sock.sendMessage(from, {
                        text: 'Halo!\nAda yang bisa dibantu?\n\nKetik angka berikut untuk main:\n1. Mini game\n2. Informasi lain'
                    });
                } else if (text === '1') {
                    await sock.sendMessage(from, {
                        text: 'Mini Game:\n\nKetik:\n- `tebak angka` untuk main tebak-tebakan\n- `quiz` buat jawab pertanyaan'
                    });
                } else if (text === 'tebak angka') {
                    const random = Math.floor(Math.random() * 10) + 1;
                    gameState.set(from, { game: 'tebak', number: random });
                    await sock.sendMessage(from, { text: 'Oke, aku udah pilih angka 1–10, coba tebak!' });
                } else if (text === 'quiz') {
                    const soal = {
                        question: 'Apa ibu kota Indonesia?',
                        answer: 'Jakarta'
                    };
                    gameState.set(from, { game: 'quiz', answer: soal.answer });
                    await sock.sendMessage(from, { text: `QUIZ: ${soal.question}` });
                }

            } catch (err) {
                console.error('Error in messages.upsert:', err);
            }
        });

    } catch (err) {
        console.error('Fatal error in startBot:', err);
        console.log('Restarting bot...');
        startBot();
    }
}

startBot();
