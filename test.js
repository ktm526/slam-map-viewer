/**
 * amrPushServer.js
 *
 * Node.js TCP 서버 예시.
 * 포트 19301에서 클라이언트가 연결되면,
 * 1초 간격으로 (2,2) ~ (-5,-5) 사이를 왕복하는 x,y 좌표를 포함한
 * "robot_push" 형식의 JSON 데이터를 전송합니다.
 *
 * 전송 형식: [16바이트 헤더][JSON 바디]
 * 헤더는 Big Endian 방식으로 작성합니다.
 */

const net = require('net');

function createHeader(apiNumber, dataLength) {
    const header = Buffer.alloc(16);
    // 0~1 바이트: 매직 넘버 (예: 0x55AA) - Big Endian
    header.writeUInt16BE(0x55AA, 0);
    // 2~3 바이트: API 번호 - Big Endian
    header.writeUInt16BE(apiNumber, 2);
    // 4~7 바이트: 데이터 길이 (JSON 바디 길이) - Big Endian
    header.writeUInt32BE(dataLength, 4);
    // 8~11 바이트: 시퀀스 번호 (테스트용 0) - Big Endian
    header.writeUInt32BE(0, 8);
    // 12~15 바이트: 예약 (테스트용 0) - Big Endian
    header.writeUInt32BE(0, 12);
    return header;
}

// TCP 서버 생성
const server = net.createServer((socket) => {
    console.log('Client connected.');

    // (2,2)에서 (-5,-5)를 왕복하기 위한 상태값
    let x = 2;
    let y = 2;
    let direction = -1; // -1이면 (2,2)→(-5,-5), +1이면 (-5,-5)→(2,2)

    // 1초마다 데이터 전송
    const intervalId = setInterval(() => {
        // x, y 좌표를 0.1m씩 변경
        x += 0.1 * direction;
        y += 0.1 * direction;

        // 범위를 벗어나면 방향 전환
        if (direction < 0 && (x <= -5 || y <= -5)) {
            direction = 1;
        } else if (direction > 0 && (x >= 2 || y >= 2)) {
            direction = -1;
        }

        // robot_push 형식 JSON 데이터 생성
        const dataObj = {

            x: parseFloat(x.toFixed(3)),
            y: parseFloat(y.toFixed(3)),
            angle: 0, // 테스트용: 0 rad
            battery_level: 1, // 100%

        };

        const jsonStr = JSON.stringify(dataObj);
        const jsonBuf = Buffer.from(jsonStr, 'utf8');

        // 헤더 생성 (Big Endian)
        const header = createHeader(19301, jsonBuf.length);
        const packet = Buffer.concat([header, jsonBuf]);

        socket.write(packet);
    }, 1000);

    socket.on('end', () => {
        console.log('Client disconnected.');
        clearInterval(intervalId);
    });

    socket.on('error', (err) => {
        console.error('Socket error:', err.message);
        clearInterval(intervalId);
    });
});

server.listen(19301, () => {
    console.log('TCP server listening on port 19301...');
});
