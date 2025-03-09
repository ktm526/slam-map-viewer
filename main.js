// main.js
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const dgram = require("dgram");
const net = require('net');
const udpServer = dgram.createSocket('udp4');
const protobuf = require("protobufjs");
const PORT = 19301; // 예: SLAM 데이터 수신 포트
const HOST = '0.0.0.0'; // 모든 인터페이스에서 수신

let currentMapData = null; // 메인 프로세스에 저장될 mapData
const settingsFilePath = path.join(app.getPath('userData'), 'settings.json');
app.commandLine.appendSwitch('disable-http-cache');

// 전역 변수 선언: AMR IP와 TCP 클라이언트
let storedAmrIp = null; // 메모리에 저장된 AMR IP
let tcpClient = null;   // AMR 데이터 구독에 사용될 TCP 클라이언트

ipcMain.on('map-data-to-main', (event, mapData) => {
    console.log('Received mapData from renderer:', mapData);
    currentMapData = mapData; // 메인 프로세스에 데이터 저장
});

// 필요 시 데이터 반환
ipcMain.handle('get-map-data', () => {
    return currentMapData;
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1200, // 초기 너비
        height: 800, // 초기 높이
        title: 'SLAM map viewer',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false, // 보안 강화를 위해 false로 설정
            contextIsolation: true, // 보안 강화를 위해 true로 설정
        },
        icon: path.join(__dirname, 'assets', 'favicon.ico'),
    });

    win.maximize(); // 창 최대화
    win.webContents.openDevTools();

    // 메뉴 템플릿 정의
    const template = [
        {
            label: '파일',
            submenu: [
                {
                    label: '파일 열기',
                    accelerator: 'CmdOrCtrl+O',
                    click: async () => {
                        try {
                            // 파일 선택 대화상자 열기
                            const { canceled, filePaths } = await dialog.showOpenDialog({
                                title: 'JSON 파일 선택',
                                defaultPath: path.join(__dirname),
                                buttonLabel: '열기',
                                filters: [
                                    { name: 'JSON Files', extensions: ['json'] },
                                    { name: 'All Files', extensions: ['*'] },
                                ],
                                properties: ['openFile'],
                            });

                            if (canceled || filePaths.length === 0) {
                                return;
                            }

                            const selectedFile = filePaths[0];
                            const fileContent = fs.readFileSync(selectedFile, 'utf-8');
                            const jsonData = JSON.parse(fileContent);
                            win.webContents.send('file-opened', jsonData);
                        } catch (error) {
                            console.error("Error opening file:", error);
                            dialog.showErrorBox('파일 열기 오류', '파일을 여는 중 오류가 발생했습니다.');
                        }
                    }
                },
                {
                    label: '파일 저장',
                    accelerator: 'CmdOrCtrl+S',
                    click: async () => {
                        if (!currentMapData) {
                            dialog.showErrorBox('Error', 'No map data available to save.');
                            return;
                        }

                        const saveDialogResult = await dialog.showSaveDialog({
                            title: 'JSON 파일 저장',
                            defaultPath: 'mapData.json',
                            filters: [
                                { name: 'JSON Files', extensions: ['json'] },
                                { name: 'All Files', extensions: ['*'] },
                            ],
                        });

                        if (saveDialogResult.canceled || !saveDialogResult.filePath) {
                            return;
                        }

                        try {
                            fs.writeFileSync(saveDialogResult.filePath, JSON.stringify(currentMapData, null, 2), 'utf-8');
                            dialog.showMessageBox({
                                type: 'info',
                                title: '저장 성공',
                                message: '맵 데이터가 성공적으로 저장되었습니다.',
                            });
                        } catch (error) {
                            console.error('Error saving map data:', error);
                            dialog.showErrorBox('Error', 'Failed to save map data.');
                        }
                    }
                },
                {
                    label: 'AMR에서 파일 불러오기',
                    click: async () => {
                        if (!storedAmrIp) {
                            dialog.showErrorBox('오류', 'AMR IP가 설정되지 않았습니다.');
                            return;
                        }

                        try {
                            const mapListResponse = await fetchMapListFromAMR(storedAmrIp);
                            if (mapListResponse.ret_code !== 0) {
                                dialog.showErrorBox('오류', `맵 목록을 가져오는 중 오류가 발생했습니다: ${mapListResponse.err_msg || '알 수 없는 오류'}`);
                                return;
                            }

                            const mapNames = mapListResponse.maps || [];
                            if (mapNames.length === 0) {
                                dialog.showMessageBox({
                                    type: 'info',
                                    title: '맵 목록 없음',
                                    message: 'AMR에 저장된 맵이 없습니다.',
                                });
                                return;
                            }

                            const buttons = mapNames.map((name, index) => `${index + 1}. ${name}`);
                            buttons.push('취소');

                            const response = await dialog.showMessageBox({
                                type: 'question',
                                title: '맵 선택',
                                message: '다운로드할 맵을 선택하세요:\n(버튼이 많을 경우 창이 자동으로 스크롤됩니다)',
                                buttons,
                                cancelId: buttons.length - 1,
                                defaultId: 0,
                            });

                            const selectedMapIndex = response.response;
                            if (selectedMapIndex === buttons.length - 1) {
                                console.log('맵 선택이 취소되었습니다.');
                                return;
                            }

                            const selectedMap = mapNames[selectedMapIndex];
                            console.log('Selected Map:', selectedMap);

                            // storedAmrIp를 사용하도록 수정
                            const downloadedMap = await downloadMapFromAMR(storedAmrIp, selectedMap);

                            const mainWindow = BrowserWindow.getFocusedWindow();
                            if (mainWindow) {
                                console.log('Sending map data to renderer:', downloadedMap);
                                mainWindow.webContents.send('map-data-updated', downloadedMap);
                            }

                            dialog.showMessageBox({
                                type: 'info',
                                title: '맵 다운로드 완료',
                                message: `맵 "${selectedMap}"이(가) 성공적으로 다운로드되었습니다.`,
                            });
                        } catch (error) {
                            console.error('Failed to download map:', error);
                            dialog.showErrorBox('오류', `맵 다운로드 중 오류가 발생했습니다: ${error.message}`);
                        }
                    },
                },
                {
                    label: 'AMR에 파일 업로드',
                    click: async () => {
                        console.log("AMR에 파일 업로드 선택됨");

                        if (!storedAmrIp) {
                            dialog.showErrorBox('오류', 'AMR IP가 설정되지 않았습니다.');
                            return;
                        }

                        if (!currentMapData) {
                            dialog.showErrorBox('오류', '업로드할 맵 데이터가 없습니다.');
                            return;
                        }

                        try {
                            const result = await uploadMapToAMR(storedAmrIp, currentMapData);
                            console.log("Upload result:", result);

                            dialog.showMessageBox({
                                type: 'info',
                                title: '업로드 성공',
                                message: '맵 데이터가 성공적으로 업로드되었습니다.',
                            });
                        } catch (error) {
                            console.error("Upload error:", error);
                            dialog.showErrorBox('오류', `업로드 중 오류가 발생했습니다: ${error.message}`);
                        }
                    }
                },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    if (process.env.NODE_ENV === 'development') {
        win.loadURL('http://localhost:3000');
        win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, 'react-dist', 'index.html'));
    }

    win.webContents.on('did-finish-load', () => {
        win.setTitle('SLAM map viewer');
    });
}

app.whenReady().then(() => {
    const settings = loadSettings();
    if (settings.amrIp) {
        storedAmrIp = settings.amrIp;
        console.log("Loaded stored AMR IP:", storedAmrIp);
    }
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

ipcMain.handle('get-current-mapdata', async () => {
    const mapData = { /* 예시 데이터 */ };
    return mapData;
});

ipcMain.handle('tcp-call', async (event, host, port, message) => {
    return new Promise((resolve) => {
        const client = new net.Socket();
        let response = '';

        client.connect(port, host, () => {
            client.write(message);
        });

        client.on('data', (data) => {
            response += data.toString();
            client.destroy();
        });

        client.on('close', () => {
            resolve({ success: true, data: response });
        });

        client.on('error', (err) => {
            resolve({ success: false, error: err.message });
        });
    });
});

ipcMain.handle('save-map-data', async (event, mapData) => {
    try {
        const filePath = await getSaveFilePath();
        fs.writeFileSync(filePath, JSON.stringify(mapData), 'utf-8');
        return { success: true, message: '맵이 성공적으로 저장되었습니다.' };
    } catch (error) {
        console.error("Error saving map data:", error);
        return { success: false, message: '맵 저장 중 오류가 발생했습니다.' };
    }
});

const getSaveFilePath = () => {
    return new Promise((resolve, reject) => {
        dialog.showSaveDialog({
            title: '맵 저장',
            defaultPath: 'map.json',
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        }).then(result => {
            if (!result.canceled && result.filePath) {
                resolve(result.filePath);
            } else {
                reject(new Error('파일 저장이 취소되었습니다.'));
            }
        }).catch(err => {
            reject(err);
        });
    });
};

ipcMain.handle('send-tcp-request', async (event, ipAddress, direction) => {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const PORT = 19205;

        console.log('Sending data to AMR:', {
            ipAddress,
            direction,
        });

        client.connect(PORT, ipAddress, () => {
            const requestBuffer = createMovementRequest(direction);
            client.write(requestBuffer);
        });

        let responseBuffer = Buffer.alloc(0);

        client.on('data', (data) => {
            responseBuffer = Buffer.concat([responseBuffer, data]);

            if (responseBuffer.length >= 16) {
                const header = parseHeader(responseBuffer.slice(0, 16));
                const dataArea = responseBuffer.slice(16, 16 + header.dataLength);
                try {
                    const jsonData = JSON.parse(dataArea.toString());
                    console.log('Response from AMR:', jsonData);
                    resolve(jsonData);
                    client.destroy();
                } catch (err) {
                    reject('Failed to parse AMR response');
                    client.destroy();
                }
            }
        });

        client.on('error', (err) => {
            console.error('Connection error:', err.message);
            reject(`Connection error: ${err.message}`);
            client.destroy();
        });

        client.on('close', () => {
            console.log('TCP connection closed');
        });
    });
});

function createMovementRequest(direction) {
    const syncHeader = 0x5A;
    const version = 0x01;
    const serialNumber = Math.floor(Math.random() * 65536);
    const apiNumber = 2010;
    const reserved = Buffer.alloc(6, 0x00);

    let vx = 0, vy = 0, w = 0, duration = 500;
    switch (direction) {
        case 'up':
            vx = 0.5;
            break;
        case 'down':
            vx = -0.5;
            break;
        case 'left':
            w = 0.5;
            break;
        case 'right':
            w = -0.5;
            break;
        default:
            break;
    }

    const data = JSON.stringify({ vx, vy, w, duration });
    const dataLength = Buffer.byteLength(data);
    const buffer = Buffer.alloc(16 + dataLength);

    buffer.writeUInt8(syncHeader, 0);
    buffer.writeUInt8(version, 1);
    buffer.writeUInt16BE(serialNumber, 2);
    buffer.writeUInt32BE(dataLength, 4);
    buffer.writeUInt16BE(apiNumber, 8);
    reserved.copy(buffer, 10);
    buffer.write(data, 16);

    return buffer;
}

function parseHeader(buffer) {
    return {
        dataLength: buffer.readUInt32BE(4),
    };
}

function fetchMapListFromAMR(amrIp) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const PORT = 19204;

        const requestBuffer = Buffer.alloc(16);
        requestBuffer.writeUInt8(0x5A, 0);
        requestBuffer.writeUInt8(0x01, 1);
        requestBuffer.writeUInt16BE(Math.floor(Math.random() * 65536), 2);
        requestBuffer.writeUInt32BE(0, 4);
        requestBuffer.writeUInt16BE(0x0514, 8);
        requestBuffer.fill(0, 10, 16);

        client.connect(PORT, amrIp, () => {
            client.write(requestBuffer);
        });

        let responseBuffer = Buffer.alloc(0);

        client.on('data', (data) => {
            responseBuffer = Buffer.concat([responseBuffer, data]);

            if (responseBuffer.length >= 16) {
                const header = responseBuffer.slice(0, 16);
                const dataLength = header.readUInt32BE(4);

                if (responseBuffer.length >= 16 + dataLength) {
                    const dataArea = responseBuffer.slice(16, 16 + dataLength);

                    try {
                        const jsonData = JSON.parse(dataArea.toString());
                        console.log('Map List Response:', jsonData);
                        resolve(jsonData);
                        client.destroy();
                    } catch (error) {
                        reject(new Error('Failed to parse map list response'));
                        client.destroy();
                    }
                }
            }
        });

        client.on('error', (err) => {
            reject(new Error(`Connection error: ${err.message}`));
            client.destroy();
        });

        client.on('close', () => {
            console.log('Connection closed');
        });
    });
}

function downloadMapFromAMR(amrIp, mapName) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const PORT = 19207;

        const requestData = JSON.stringify({ map_name: mapName });
        const requestBuffer = Buffer.alloc(16 + Buffer.byteLength(requestData));

        requestBuffer.writeUInt8(0x5A, 0);
        requestBuffer.writeUInt8(0x01, 1);
        requestBuffer.writeUInt16BE(Math.floor(Math.random() * 65536), 2);
        requestBuffer.writeUInt32BE(Buffer.byteLength(requestData), 4);
        requestBuffer.writeUInt16BE(0x0FAB, 8);
        requestBuffer.fill(0, 10, 16);
        requestBuffer.write(requestData, 16);

        client.connect(PORT, amrIp, () => {
            client.write(requestBuffer);
        });

        let responseBuffer = Buffer.alloc(0);

        client.on('data', (data) => {
            responseBuffer = Buffer.concat([responseBuffer, data]);

            if (responseBuffer.length >= 16) {
                const header = responseBuffer.slice(0, 16);
                const dataLength = header.readUInt32BE(4);

                if (responseBuffer.length >= 16 + dataLength) {
                    const dataArea = responseBuffer.slice(16, 16 + dataLength);

                    try {
                        const jsonData = JSON.parse(dataArea.toString());
                        console.log('Downloaded Map Data:', jsonData);

                        if (jsonData.ret_code && jsonData.ret_code !== 0) {
                            reject(new Error(jsonData.err_msg || 'Unknown error'));
                        } else {
                            resolve(jsonData);
                        }
                        client.destroy();
                    } catch (error) {
                        reject(new Error('Failed to parse map data response'));
                        client.destroy();
                    }
                }
            }
        });

        client.on('error', (err) => {
            reject(new Error(`Connection error: ${err.message}`));
            client.destroy();
        });

        client.on('close', () => {
            console.log('Map download connection closed');
        });
    });
}

ipcMain.handle('show-map-list', async (event, mapNames) => {
    const mapWindow = new BrowserWindow({
        width: 400,
        height: 600,
        title: '맵 파일 선택',
        modal: true,
        parent: BrowserWindow.getFocusedWindow(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mapWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>맵 파일 선택</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 0; overflow: hidden; }
                .container { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
                .map-list { flex: 1; overflow-y: auto; padding: 10px; border-bottom: 1px solid #ccc; }
                .map-item { padding: 10px; border: 1px solid #ccc; margin-bottom: 5px; cursor: pointer; }
                .map-item:hover { background-color: #f0f0f0; }
                .actions { padding: 10px; display: flex; justify-content: flex-end; gap: 10px; }
                button { padding: 8px 16px; font-size: 14px; cursor: pointer; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="map-list" id="mapList">
                    ${mapNames.map((name) => `<div class="map-item" data-name="${name}">${name}</div>`).join('')}
                </div>
                <div class="actions">
                    <button id="cancelButton">취소</button>
                </div>
            </div>
            <script>
                // 참고: nodeIntegration이 false이므로, preload에서 ipcRenderer를 노출시켜야 합니다.
                const { ipcRenderer } = require('electron');
                document.querySelectorAll('.map-item').forEach(item => {
                    item.addEventListener('click', () => {
                        ipcRenderer.send('map-selected', item.dataset.name);
                    });
                });
                document.getElementById('cancelButton').addEventListener('click', () => {
                    ipcRenderer.send('map-cancel');
                });
            </script>
        </body>
        </html>
    `)}`);

    ipcMain.once('map-selected', (event, selectedMap) => {
        mapWindow.close();
        event.returnValue = selectedMap;
    });

    ipcMain.once('map-cancel', () => {
        mapWindow.close();
    });

    return new Promise((resolve, reject) => {
        mapWindow.once('closed', () => {
            resolve(null);
        });
    });
});

ipcMain.handle('set-amr-ip', async (event, amrIp) => {
    console.log("Setting AMR IP:", amrIp);
    storedAmrIp = amrIp;

    let currentSettings = loadSettings();
    currentSettings.amrIp = amrIp;
    saveSettings(currentSettings);

    return storedAmrIp;
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

function loadSettings() {
    try {
        if (fs.existsSync(settingsFilePath)) {
            const raw = fs.readFileSync(settingsFilePath, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (error) {
        console.error("Error loading settings:", error);
    }
    return {};
}

function saveSettings(settings) {
    try {
        fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (error) {
        console.error("Error saving settings:", error);
    }
}

const API_NUMBER_FOR_UPLOAD = 0x0FAC;

function uploadMapToAMR(amrIp, mapData) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const PORT = 19205;

        const jsonString = JSON.stringify(mapData);
        const headerSize = 16;
        const dataLength = Buffer.byteLength(jsonString);
        const buffer = Buffer.alloc(headerSize + dataLength);

        buffer.writeUInt8(0x5A, 0);
        buffer.writeUInt8(0x01, 1);
        buffer.writeUInt16BE(Math.floor(Math.random() * 65536), 2);
        buffer.writeUInt32BE(dataLength, 4);
        buffer.writeUInt16BE(API_NUMBER_FOR_UPLOAD, 8);
        buffer.fill(0, 10, 16);
        buffer.write(jsonString, 16);

        client.connect(PORT, amrIp, () => {
            client.write(buffer);
        });

        let responseBuffer = Buffer.alloc(0);

        client.on('data', (chunk) => {
            responseBuffer = Buffer.concat([responseBuffer, chunk]);

            if (responseBuffer.length >= 16) {
                const dataLen = responseBuffer.readUInt32BE(4);
                if (responseBuffer.length >= 16 + dataLen) {
                    const dataArea = responseBuffer.slice(16, 16 + dataLen);
                    try {
                        const jsonData = JSON.parse(dataArea.toString());
                        console.log("Upload response:", jsonData);

                        if (jsonData.ret_code && jsonData.ret_code !== 0) {
                            reject(new Error(jsonData.err_msg || 'Unknown error'));
                        } else {
                            resolve(jsonData);
                        }
                    } catch (err) {
                        reject(new Error('Failed to parse AMR response'));
                    }
                    client.destroy();
                }
            }
        });

        client.on('error', (err) => {
            reject(err);
            client.destroy();
        });

        client.on('close', () => {
            console.log('Upload connection closed');
        });
    });
}

ipcMain.handle('subscribe-to-push-data', (event, amrIp, port) => {
    return new Promise((resolve, reject) => {
        let responseBuffer = Buffer.alloc(0);
        tcpClient = new net.Socket();

        tcpClient.connect(port, amrIp, () => {
            console.log(`Connected to AMR at ${amrIp}:${port}`);
            resolve(true);
        });

        tcpClient.on('data', (data) => {
            console.log('Received data:', data);
            responseBuffer = Buffer.concat([responseBuffer, data]);

            while (responseBuffer.length >= 16) {
                const header = parseHeader(responseBuffer.slice(0, 16));
                console.log('Parsed header:', header);
                const expectedLength = 16 + header.dataLength;

                if (responseBuffer.length >= expectedLength) {
                    const packet = responseBuffer.slice(0, expectedLength);
                    responseBuffer = responseBuffer.slice(expectedLength);

                    const dataArea = packet.slice(16);
                    console.log('Data area:', dataArea);
                    try {
                        const jsonData = JSON.parse(dataArea.toString());
                        console.log('Decoded push data:', jsonData);

                        event.sender.send('push-data', jsonData);
                    } catch (error) {
                        console.error(`Failed to parse JSON data: ${error.message}`);
                    }
                } else {
                    console.log('Not yet full packet');
                    break;
                }
            }
        });

        tcpClient.on('error', (err) => {
            console.error('TCP connection error:', err.message);
            reject(err);
        });

        tcpClient.on('close', () => {
            console.log('TCP connection closed');
        });

        tcpClient.on('timeout', () => {
            console.error('TCP request timed out');
            reject(new Error('TCP request timed out'));
            tcpClient.destroy();
        });
    });
});

ipcMain.handle('unsubscribe-from-push-data', () => {
    if (tcpClient) {
        tcpClient.destroy();
        tcpClient = null;
        console.log('Disconnected from AMR');
    }
});
