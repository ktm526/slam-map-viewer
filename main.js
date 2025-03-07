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

        }, icon: path.join(__dirname, 'assets', 'favicon.ico'), // 아이콘 경로 설정

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
                                defaultPath: path.join(__dirname), // 기본 폴더를 'data'로 설정
                                buttonLabel: '열기',
                                filters: [
                                    { name: 'JSON Files', extensions: ['json'] },
                                    { name: 'All Files', extensions: ['*'] },
                                ],
                                properties: ['openFile'], // 파일 열기만 허용
                            });

                            // 파일 선택이 취소되었는지 확인
                            if (canceled || filePaths.length === 0) {
                                return; // 취소 시 아무 작업도 하지 않음
                            }

                            // 선택된 파일 경로 가져오기
                            const selectedFile = filePaths[0];

                            // 파일 내용 읽기
                            const fileContent = fs.readFileSync(selectedFile, 'utf-8');

                            // JSON 데이터 파싱
                            const jsonData = JSON.parse(fileContent);

                            // 데이터 처리 (렌더러 프로세스로 전송)
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
                            return; // 사용자가 저장 취소
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
                        //const amrIp = '192.168.196.102'; // AMR IP
                        if (!storedAmrIp) {
                            dialog.showErrorBox('오류', 'AMR IP가 설정되지 않았습니다.');
                            return;
                        }

                        try {
                            // Fetch map list from AMR
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

                            // 취소 버튼 포함 리스트 생성
                            const buttons = mapNames.map((name, index) => `${index + 1}. ${name}`);
                            buttons.push('취소'); // 취소 버튼 추가

                            // 맵 선택 dialog
                            const response = await dialog.showMessageBox({
                                type: 'question',
                                title: '맵 선택',
                                message: '다운로드할 맵을 선택하세요:\n(버튼이 많을 경우 창이 자동으로 스크롤됩니다)',
                                buttons,
                                cancelId: buttons.length - 1, // '취소' 버튼을 취소 ID로 설정
                                defaultId: 0, // 첫 번째 버튼을 기본값으로 설정
                            });

                            const selectedMapIndex = response.response;
                            if (selectedMapIndex === buttons.length - 1) { // '취소' 버튼 확인
                                console.log('맵 선택이 취소되었습니다.');
                                return;
                            }

                            const selectedMap = mapNames[selectedMapIndex];
                            console.log('Selected Map:', selectedMap);

                            // Download selected map
                            const downloadedMap = await downloadMapFromAMR(amrIp, selectedMap);

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

                        // AMR IP 설정 여부 확인
                        if (!storedAmrIp) {
                            dialog.showErrorBox('오류', 'AMR IP가 설정되지 않았습니다.');
                            return;
                        }

                        // 업로드할 mapData 여부 확인
                        if (!currentMapData) {
                            dialog.showErrorBox('오류', '업로드할 맵 데이터가 없습니다.');
                            return;
                        }

                        try {
                            // 실제 업로드 진행
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

    // React 앱이 로드된 후 창 제목 다시 설정
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
    // 렌더러 프로세스에서 제공하는 현재 mapData를 반환
    // 실제 mapData는 렌더러 프로세스에서 관리 중이라고 가정
    const mapData = { /* 예시 데이터: 렌더러에서 전달받은 JSON 객체 */ };
    return mapData; // 렌더러에서 현재 mapData를 제공받아야 함 EYL42@8430
});

// TCP API 호출 핸들러 유지
ipcMain.handle('tcp-call', async (event, host, port, message) => {
    return new Promise((resolve) => {
        const client = new net.Socket();
        let response = '';

        client.connect(port, host, () => {
            client.write(message);
        });

        client.on('data', (data) => {
            response += data.toString();
            client.destroy(); // 데이터 수신 후 연결 종료
        });

        client.on('close', () => {
            resolve({ success: true, data: response });
        });

        client.on('error', (err) => {
            resolve({ success: false, error: err.message });
        });
    });
});

// 맵 데이터 저장 핸들러 유지
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

// 파일 경로를 얻는 함수 유지
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

// AMR 이동 TCP 요청 핸들러
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
    const apiNumber = 2010; // Open Loop Motion API
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
        syncHeader: buffer.readUInt8(0),
        version: buffer.readUInt8(1),
        serialNumber: buffer.readUInt16BE(2),
        dataLength: buffer.readUInt32BE(4),
        apiNumber: buffer.readUInt16BE(8),
        reserved: buffer.slice(10, 16),
    };
}

function fetchMapListFromAMR(amrIp) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const PORT = 19204; // Replace with the correct AMR port for map requests

        const requestBuffer = Buffer.alloc(16);
        requestBuffer.writeUInt8(0x5A, 0); // syncHeader
        requestBuffer.writeUInt8(0x01, 1); // version
        requestBuffer.writeUInt16BE(Math.floor(Math.random() * 65536), 2); // serialNumber
        requestBuffer.writeUInt32BE(0, 4); // dataLength
        requestBuffer.writeUInt16BE(0x0514, 8); // API number for map list
        requestBuffer.fill(0, 10, 16); // reserved

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
        const PORT = 19207; // Replace with the correct AMR port for map requests

        const requestData = JSON.stringify({ map_name: mapName });
        const requestBuffer = Buffer.alloc(16 + Buffer.byteLength(requestData));

        // Write protocol header
        requestBuffer.writeUInt8(0x5A, 0); // syncHeader
        requestBuffer.writeUInt8(0x01, 1); // version
        requestBuffer.writeUInt16BE(Math.floor(Math.random() * 65536), 2); // serialNumber
        requestBuffer.writeUInt32BE(Buffer.byteLength(requestData), 4); // dataLength
        requestBuffer.writeUInt16BE(0x0FAB, 8); // API number for downloading maps
        requestBuffer.fill(0, 10, 16); // reserved
        requestBuffer.write(requestData, 16); // JSON data area

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
                            resolve(jsonData); // Resolve with map data
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
// ipcMain.handle('get-map-data', async () => {
//     const focusedWindow = BrowserWindow.getFocusedWindow();
//     if (!focusedWindow) {
//         throw new Error("No active window found");
//     }

//     // 비동기적으로 렌더러 프로세스에 요청
//     return await focusedWindow.webContents.executeJavaScript('window.electronAPI.getCurrentMapData()');
// });


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
                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                    overflow: hidden;
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    overflow: hidden;
                }
                .map-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 10px;
                    border-bottom: 1px solid #ccc;
                }
                .map-item {
                    padding: 10px;
                    border: 1px solid #ccc;
                    margin-bottom: 5px;
                    cursor: pointer;
                }
                .map-item:hover {
                    background-color: #f0f0f0;
                }
                .actions {
                    padding: 10px;
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                }
                button {
                    padding: 8px 16px;
                    font-size: 14px;
                    cursor: pointer;
                }
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
        event.returnValue = selectedMap; // 선택된 맵 반환
    });

    ipcMain.once('map-cancel', () => {
        mapWindow.close();
    });

    return new Promise((resolve, reject) => {
        mapWindow.once('closed', () => {
            resolve(null); // 창 닫힐 때 취소
        });
    });
});
let storedAmrIp = null; // 메모리에 저장된 AMR IP

// main.js
ipcMain.handle('set-amr-ip', async (event, amrIp) => {
    console.log("Setting AMR IP:", amrIp);
    storedAmrIp = amrIp;

    // 현재 설정 파일 읽어오기
    let currentSettings = loadSettings();
    currentSettings.amrIp = amrIp;
    saveSettings(currentSettings);

    // 업데이트된 값을 반환 (필요시)
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

// 예: 업로드용 API 번호 (문서에 따라 적절히 수정 필요)
const API_NUMBER_FOR_UPLOAD = 0x0FAC;

/**
 * AMR로 mapData를 업로드하는 함수
 * @param {string} amrIp - AMR IP
 * @param {object} mapData - 업로드할 맵 데이터(객체)
 * @returns {Promise<object>} - 업로드 결과(AMR 측 응답)
 */
function uploadMapToAMR(amrIp, mapData) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const PORT = 19205; // 업로드에 사용되는 포트

        // 1) JSON 직렬화
        const jsonString = JSON.stringify(mapData);

        // 2) 패킷 헤더 + JSON 데이터를 담을 버퍼 생성
        const headerSize = 16;
        const dataLength = Buffer.byteLength(jsonString);
        const buffer = Buffer.alloc(headerSize + dataLength);

        // 3) 헤더 작성
        // 3-1) Sync Header (1 byte, 0x5A)
        buffer.writeUInt8(0x5A, 0);
        // 3-2) Protocol version (1 byte, 0x01)
        buffer.writeUInt8(0x01, 1);
        // 3-3) Serial number (2 bytes, 0~65535 범위 임의로)
        buffer.writeUInt16BE(Math.floor(Math.random() * 65536), 2);
        // 3-4) Data area length (4 bytes, JSON 바이트 길이)
        buffer.writeUInt32BE(dataLength, 4);
        // 3-5) Message type (API number) (2 bytes)
        buffer.writeUInt16BE(API_NUMBER_FOR_UPLOAD, 8);
        // 3-6) Reserved area (6 bytes, 0으로 채움)
        buffer.fill(0, 10, 16);

        // 4) JSON 데이터를 헤더 뒤에 작성
        buffer.write(jsonString, 16);

        // 5) TCP 연결 후 버퍼 전송
        client.connect(PORT, amrIp, () => {
            client.write(buffer);
        });

        let responseBuffer = Buffer.alloc(0);

        // 6) 응답 수신
        client.on('data', (chunk) => {
            responseBuffer = Buffer.concat([responseBuffer, chunk]);

            // 최소 헤더(16바이트) 수신 확인
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

        // 에러 처리
        client.on('error', (err) => {
            reject(err);
            client.destroy();
        });

        client.on('close', () => {
            console.log('Upload connection closed');
        });
    });
}