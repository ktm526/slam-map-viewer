// main.js
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const dgram = require("dgram");
const net = require('net');
const udpServer = dgram.createSocket('udp4');
const protobuf = require("protobufjs");
const root = protobuf.loadSync("slam.proto");
const Message_Map = root.lookupType("rbk.protocol.Message_Map");
const PORT = 19301; // 예: SLAM 데이터 수신 포트
const HOST = '0.0.0.0'; // 모든 인터페이스에서 수신

let currentMapData = null; // 메인 프로세스에 저장될 mapData
let connectedClients = [];
let robotData = null;
let tcpClient = null;


const protoFilePath = "slam.proto"; // 실제 .proto 파일 경로로 대체
let Message_MapLogData;

protobuf.load(protoFilePath, (err, root) => {
    if (err) {
        console.error("Failed to load proto file:", err);
        return;
    }
    // Message_MapLogData 메시지 정의 로드
    Message_MapLogData = root.lookupType("rbk.protocol.Message_Map");
    console.log("Proto definitions loaded successfully.");
});



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
                            // 'data' 폴더 경로 정의
                            const dataFolderPath = path.join(__dirname, 'data');

                            // 'data' 폴더 존재 확인 및 생성
                            if (!fs.existsSync(dataFolderPath)) {
                                fs.mkdirSync(dataFolderPath);
                            }

                            // 'data' 폴더 내의 JSON 파일 목록 가져오기
                            const files = fs.readdirSync(dataFolderPath).filter(file => file.endsWith('.json'));

                            if (files.length === 0) {
                                dialog.showMessageBox(win, {
                                    type: 'info',
                                    title: '파일 없음',
                                    message: '일이 존재하지 않습니다.',
                                });
                                return;
                            }

                            // 파일 선택 대화상자 열기
                            const { canceled, filePaths } = await dialog.showOpenDialog(win, {
                                title: 'JSON 파일 선택',
                                defaultPath: dataFolderPath,
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

                            // 렌더러 프로세스로 데이터 전송
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
                        const amrIp = '192.168.45.3'; // AMR IP
                        if (!amrIp) {
                            dialog.showErrorBox('오류', 'AMR IP가 설정되지 않았습니다.');
                            return;
                        }

                        try {
                            // Fetch map list from AMR
                            const mapListResponse = await fetchMapListFromAMR(amrIp);
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
                    click: () => {
                        console.log("AMR에 파일 업로드 선택됨");
                        // AMR에 파일 업로드 동작 추가
                        // win.webContents.send('upload-to-amr');
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
        win.loadFile(path.join(__dirname, 'app', 'build', 'index.html'));
    }

    // React 앱이 로드된 후 창 제목 다시 설정
    win.webContents.on('did-finish-load', () => {
        win.setTitle('SLAM map viewer');
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

udpServer.on("message", (msg, rinfo) => {
    console.log(`Received UDP message from ${rinfo.address}:${rinfo.port}`);

    try {
        // 프로토콜 버퍼 메시지 디코딩
        if (!Message_MapLogData) {
            console.error("Proto definitions not loaded yet.");
            return;
        }
        const decodedMessage = Message_MapLogData.decode(msg);

        // 디코딩된 메시지 출력
        console.log("Decoded Message_MapLogData:", decodedMessage);

        // 필요한 작업 수행 (예: React 렌더러에 데이터 전송)
        BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send("slam-data", decodedMessage);
        });
    } catch (error) {
        console.error("Failed to decode UDP message:", error);
    }
});

udpServer.on("error", (err) => {
    console.error("UDP server error:", err.message);
});

udpServer.on("listening", () => {
    const address = udpServer.address();
    console.log(`UDP server listening on ${address.address}:${address.port}`);
});

// 서버 바인딩
const udpPORT = 19301; // 포트 번호
const udpHOST = "0.0.0.0"; // 모든 인터페이스에서 수신
udpServer.bind(udpPORT, udpHOST);

ipcMain.handle('get-current-mapdata', async () => {
    // 렌더러 프로세스에서 제공하는 현재 mapData를 반환
    // 실제 mapData는 렌더러 프로세스에서 관리 중이라고 가정
    const mapData = { /* 예시 데이터: 렌더러에서 전달받은 JSON 객체 */ };
    return mapData; // 렌더러에서 현재 mapData를 제공받아야 함 EYL42@8430
});
// // 기존 IPC 핸들러들 유지
// ipcMain.handle('read-file', async (event, filePath) => {
//     try {
//         const data = fs.readFileSync(filePath, 'utf-8');
//         return { success: true, data };
//     } catch (error) {
//         return { success: false, error: error.message };
//     }
// });

// ipcMain.handle('write-file', async (event, filePath, content) => {
//     try {
//         fs.writeFileSync(filePath, content, 'utf-8');
//         return { success: true };
//     } catch (error) {
//         return { success: false, error: error.message };
//     }
// });

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
ipcMain.handle('start-slam', async (event, amrIp) => {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const PORT = 19210; // 로봇 제어 포트

        const slamRequestData = {
            slam_type: 2, // 2 = 실시간 SLAM
            real_time: true, // 실시간 활성화
            screen_width: 800, // 화면 너비 (필요 시 조정)
            screen_height: 600, // 화면 높이 (필요 시 조정)
        };

        const slamRequestBuffer = createSlamRequest(slamRequestData, 0x17D4); // 요청 생성

        client.connect(PORT, amrIp, () => {
            console.log('Connected to AMR for real-time SLAM');
            client.write(slamRequestBuffer);
        });

        client.on('data', (data) => {
            const header = parseHeader(data.slice(0, 16));
            const dataArea = data.slice(16, 16 + header.dataLength);

            try {
                const jsonData = JSON.parse(dataArea.toString());
                console.log('Real-time SLAM Data:', jsonData);

                // React 렌더러로 데이터 전송
                BrowserWindow.getAllWindows().forEach((win) => {
                    win.webContents.send('slam-data', jsonData);
                });
            } catch (err) {
                console.error('Failed to parse real-time SLAM data:', err.message);
            }
        });

        client.on('error', (err) => {
            console.error('SLAM Connection Error:', err.message);
            reject(`Connection error: ${err.message}`);
        });

        client.on('close', () => {
            console.log('SLAM connection closed');
        });

        resolve({ success: true, message: 'Real-time SLAM started' });
    });
});

ipcMain.handle('end-slam', async (event, amrIp) => {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const PORT = 19210;

        const endSlamRequestBuffer = createSlamRequest({}, 0x17D5); // SLAM 종료 요청 생성

        client.connect(PORT, amrIp, () => {
            console.log('Sending SLAM end request...');
            client.write(endSlamRequestBuffer);
        });

        client.on('data', (data) => {
            const header = parseHeader(data.slice(0, 16));
            const dataArea = data.slice(16, 16 + header.dataLength);

            try {
                const jsonData = JSON.parse(dataArea.toString());
                console.log('SLAM End Response:', jsonData);
                resolve(jsonData);
            } catch (error) {
                console.error('Failed to parse SLAM End Response:', error.message);
                reject('Failed to parse SLAM end response');
            } finally {
                client.destroy();
            }
        });

        client.on('error', (err) => {
            console.error('SLAM End Request Connection Error:', err.message);
            reject(`Connection error: ${err.message}`);
            client.destroy();
        });

        client.on('close', () => {
            console.log('SLAM connection closed');
        });
    });
});


function createSlamRequest(data, apiNumber) {
    const syncHeader = 0x5A; // 고정된 헤더
    const version = 0x01;   // 프로토콜 버전
    const serialNumber = Math.floor(Math.random() * 65536); // 랜덤 시리얼 번호
    const reserved = Buffer.alloc(6, 0x00); // 예약 필드 초기화

    const jsonData = JSON.stringify(data); // JSON 데이터 직렬화
    const dataLength = Buffer.byteLength(jsonData); // 직렬화된 데이터 길이
    const buffer = Buffer.alloc(16 + dataLength); // 전체 요청 버퍼 생성

    buffer.writeUInt8(syncHeader, 0); // 헤더
    buffer.writeUInt8(version, 1);   // 버전
    buffer.writeUInt16BE(serialNumber, 2); // 시리얼 번호
    buffer.writeUInt32BE(dataLength, 4);   // 데이터 길이
    buffer.writeUInt16BE(apiNumber, 8);    // API 번호
    reserved.copy(buffer, 10);             // 예약 필드 복사
    buffer.write(jsonData, 16);            // JSON 데이터 삽입

    return buffer;
}

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

// TCP 서버 설정
const tcpServer = net.createServer((socket) => {
    connectedClients.push(socket);
    console.log('Client connected:', socket.remoteAddress);

    socket.on('data', (data) => {
        try {
            const parsedData = JSON.parse(data.toString());
            console.log('Received robot data:', parsedData);
            robotData = parsedData;

            // 렌더러 프로세스에 데이터 전송
            BrowserWindow.getAllWindows().forEach((win) => {
                win.webContents.send('robot-data-update', robotData);
            });
        } catch (err) {
            console.error('Failed to parse robot data:', err.message);
        }
    });

    socket.on('close', () => {
        console.log('Client disconnected:', socket.remoteAddress);
        connectedClients = connectedClients.filter((client) => client !== socket);
    });

    socket.on('error', (err) => {
        console.error('Socket error:', err.message);
    });
});

tcpServer.listen(19301, '0.0.0.0', () => {
    console.log('TCP server listening on port 19301');
});

// AMR 데이터 구독 시작
ipcMain.handle('subscribe-to-push-data', (event, amrIp, port) => {
    return new Promise((resolve, reject) => {
        let responseBuffer = Buffer.alloc(0); // 데이터 수신 버퍼 초기화
        tcpClient = new net.Socket();

        tcpClient.connect(port, amrIp, () => {
            console.log(`Connected to AMR at ${amrIp}:${port}`);
            resolve(true); // 성공 시 true 반환
        });

        tcpClient.on('data', (data) => {
            responseBuffer = Buffer.concat([responseBuffer, data]); // 버퍼에 데이터 추가

            // 최소 헤더 크기(16바이트)를 기준으로 확인
            while (responseBuffer.length >= 16) {
                const header = parseHeader(responseBuffer.slice(0, 16)); // 헤더 파싱
                const expectedLength = 16 + header.dataLength; // 예상되는 전체 패킷 길이

                if (responseBuffer.length >= expectedLength) {
                    const packet = responseBuffer.slice(0, expectedLength); // 완전한 패킷 추출
                    responseBuffer = responseBuffer.slice(expectedLength); // 처리된 패킷 제거

                    const dataArea = packet.slice(16); // 데이터 영역 추출
                    try {
                        const jsonData = JSON.parse(dataArea.toString()); // JSON 파싱
                        console.log('Decoded push data:', jsonData);

                        // 데이터를 렌더러 프로세스로 전송
                        event.sender.send('push-data', jsonData);
                    } catch (error) {
                        console.error(`Failed to parse JSON data: ${error.message}`);
                    }
                } else {
                    // 아직 전체 패킷이 수신되지 않음
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
            tcpClient.destroy(); // 타임아웃 발생 시 연결 종료
        });
    });
});

// 헤더 파싱 함수 (예제)
function parseHeader(buffer) {
    return {
        dataLength: buffer.readUInt32BE(4), // 헤더에서 데이터 길이 추출 (예제)
    };
}


// AMR 데이터 구독 중단
ipcMain.handle('unsubscribe-from-push-data', () => {
    if (tcpClient) {
        tcpClient.destroy();
        tcpClient = null;
        console.log('Disconnected from AMR');
    }
});

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

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
