// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
    tcpCall: (host, port, message) => ipcRenderer.invoke('tcp-call', host, port, message),
    saveMapData: (mapData) => ipcRenderer.invoke('save-map-data', mapData),
    // 파일 열기 이벤트 리스너 추가
    onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, data) => callback(data)),
    removeFileOpenedListener: () => ipcRenderer.removeAllListeners('file-opened'),
    on: (channel, callback) => {
        let validChannels = ['map-data-updated', 'slam-data', 'menu-new-window'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => {
                console.log(`Event received in preload.js: ${channel}`, args);
                callback(...args);
            });
        }
    },
    removeListener: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    },
    getCurrentMapData: () => {
        console.log('Fetching mapData in preload from window:', window.mapData); // 디버깅용 로그
        return window.mapData || null; // mapData 반환
    },

    handleGetMapData: (handler) => {
        ipcRenderer.on('get-map-data', (event) => {
            console.log('Received "get-map-data" in preload.js');
            const data = handler();
            console.log('Returning mapData:', data);
            event.returnValue = data;
        });
    },
    removeGetMapDataHandler: () => ipcRenderer.removeAllListeners('get-map-data'),
    sendTcpRequest: (ipAddress, direction) =>
        ipcRenderer.invoke('send-tcp-request', ipAddress, direction),
    startSlam: (amrIp, slamType, realTime) => ipcRenderer.invoke('start-slam', amrIp, slamType, realTime),
    endSlam: (amrIp) => ipcRenderer.invoke('end-slam', amrIp),
    onSlamData: (callback) => ipcRenderer.on('slam-data', (event, data) => callback(data)),
    getMapDataSync: () => ipcRenderer.sendSync('get-map-data'),
    onRequestMapData: (callback) => ipcRenderer.on('request-map-data', () => {
        const mapData = getCurrentMapData(); // 현재 상태에서 mapData를 반환
        callback(mapData);
    }),
    sendMapDataToMain: (mapData) => {
        ipcRenderer.send('map-data-to-main', mapData); // 렌더러 -> 메인 데이터 전송
    },
    onRobotDataUpdate: (callback) => {
        ipcRenderer.on('robot-data-update', (event, data) => {
            console.log('Robot data received in renderer:', data);
            callback(data);
        });
    },
    subscribeToPushData: (amrIp, port) => ipcRenderer.invoke('subscribe-to-push-data', amrIp, port),
    unsubscribeFromPushData: () => ipcRenderer.invoke('unsubscribe-from-push-data'),
    onPushData: (callback) => {
        ipcRenderer.on('push-data', (event, data) => {
            callback(data); // TCP 데이터를 렌더러로 전달
        });
    },
});

console.log('electronAPI exposed to main world');
