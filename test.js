/**
 * testServer.js
 *
 * 세 개의 TCP 서버를 실행합니다.
 * 1. 포트 19301: 매 1초마다 robot_push 데이터를 전송
 * 2. 포트 19204: 
 *    - fetchMapListFromAMR 요청(0x0514)에 대해 맵 목록 응답
 *    - robot_status_laser_req 요청(0x03F1)에 대해 레이저 포인트 클라우드 응답
 *
 * 전송 형식: [16바이트 헤더][JSON 바디]
 * 헤더는 모두 Big Endian 방식으로 작성합니다.
 */

const net = require('net');
const fs = require('fs')

// 공용: 16바이트 헤더 생성 (Big Endian)
function createHeader(apiNumber, dataLength) {
    const header = Buffer.alloc(16);
    // 0~1 바이트: 매직 넘버 (0x55AA - 임의)
    header.writeUInt16BE(0x55AA, 0);
    // 2~3 바이트: API 번호
    header.writeUInt16BE(apiNumber, 2);
    // 4~7 바이트: 데이터 길이 (JSON 바디 길이)
    header.writeUInt32BE(dataLength, 4);
    // 8~11 바이트: 시퀀스 번호 (테스트용 0)
    header.writeUInt32BE(0, 8);
    // 12~15 바이트: 예약 (테스트용 0)
    header.writeUInt32BE(0, 12);
    return header;
}

/* --- 포트 19301: robot_push 데이터 전송 서버 --- */
const pushServer = net.createServer((socket) => {
    console.log('Push Server: Client connected.');

    let x = 2;
    let y = 2;
    let direction = -1; // -1이면 (2,2)→(-5,-5), +1이면 (-5,-5)→(2,2)

    const intervalId = setInterval(() => {
        // x, y 좌표 0.1m씩 이동
        x += 0.1 * direction;
        y += 0.1 * direction;

        // 범위 체크하여 방향 전환
        if (direction < 0 && (x <= -5 || y <= -5)) {
            direction = 1;
        } else if (direction > 0 && (x >= 2 || y >= 2)) {
            direction = -1;
        }

        // 응답 JSON 객체 (robot_push 데이터)
        const dataObj = {
            x: parseFloat(x.toFixed(3)),
            y: parseFloat(y.toFixed(3)),
            angle: 0, // 테스트용: 0 rad
            battery_level: 1
        };

        const jsonStr = JSON.stringify(dataObj);
        const jsonBuf = Buffer.from(jsonStr, 'utf8');

        // 헤더 생성 (API 번호 19301)
        const header = createHeader(19301, jsonBuf.length);
        const packet = Buffer.concat([header, jsonBuf]);

        socket.write(packet);
    }, 1000);

    socket.on('end', () => {
        console.log('Push Server: Client disconnected.');
        clearInterval(intervalId);
    });

    socket.on('error', (err) => {
        console.error('Push Server: Socket error:', err.message);
        clearInterval(intervalId);
    });
});

pushServer.listen(19301, () => {
    console.log('Push Server: TCP server listening on port 19301...');
});

/* --- 포트 19204: 맵 목록 & 레이저 데이터 요청 응답 서버 --- */
const mapListServer = net.createServer((socket) => {
    console.log('Map List Server: Client connected.');

    let requestBuffer = Buffer.alloc(0);

    socket.on('data', (data) => {
        requestBuffer = Buffer.concat([requestBuffer, data]);

        // 최소 16바이트 헤더 수신 시 처리 시작
        if (requestBuffer.length >= 16) {
            // 요청 헤더 파싱
            //  0~1 바이트: 매직 넘버 (0x55AA)
            //  2~3 바이트: API 번호
            //  4~7 바이트: dataLength
            //  8~11 바이트: 시퀀스
            //  12~15 바이트: 예약
            const magic = requestBuffer.readUInt16BE(0);
            const apiNumber = requestBuffer.readUInt16BE(2);
            const dataLength = requestBuffer.readUInt32BE(4);

            console.log(`Map List Server: Received request. API Number: 0x${apiNumber.toString(16)}, Data Length: ${dataLength}`);

            // 요청 바디 (JSON) 파싱 (필요하다면)
            let bodyBuf = Buffer.alloc(0);
            if (requestBuffer.length >= 16 + dataLength) {
                bodyBuf = requestBuffer.slice(16, 16 + dataLength);
            }

            // API 번호 분기
            if (apiNumber === 0x0514) {

                // (기존) 맵 목록 요청에 대한 응답
                const responseObj = {
                    maps: ["Map1", "Map2", "Map3"],
                    ret_code: 0
                };
                const responseStr = JSON.stringify(responseObj);
                const responseBuf = Buffer.from(responseStr, 'utf8');

                // 응답 헤더 생성 (API 번호 0x0514 그대로 써도 되지만, 실제 장비에서 어떻게 하는지에 따라 다름)
                const header = createHeader(0x0514, responseBuf.length);
                const packet = Buffer.concat([header, responseBuf]);

                socket.write(packet, () => {
                    console.log('Map List Server: map list Response sent.');
                    socket.end();
                });
            }
            else if (apiNumber === 0x03F1) {
                console.log('Received laser request');
                // result.txt 파일에서 레이저 데이터 읽기 (파일 내용은 이전 예시와 동일하다고 가정)
                fs.readFile('result01.txt', 'utf8', (err, data) => {
                    if (err) {
                        console.error('Error reading result.txt:', err);
                        socket.end();
                        return;
                    }
                    console.log(data)
                    // data는 JSON 문자열이어야 합니다.
                    const responseBuf = Buffer.from(data, 'utf8');
                    // 응답 헤더 생성 (API 번호 0x2B01 = 11009)
                    const header = createHeader(0x2B01, responseBuf.length);
                    const packet = Buffer.concat([header, responseBuf]);
                    socket.write(packet, () => {
                        console.log('Map List Server: laser data Response sent from file.');
                        socket.end();
                    });
                });
            }

            else {
                console.log(`Map List Server: Unknown API Number: 0x${apiNumber.toString(16)}`);
                // 필요 시 에러 응답을 보낼 수 있음
                socket.end();
            }

            // 요청 버퍼 초기화
            requestBuffer = Buffer.alloc(0);
        }
    });

    socket.on('error', (err) => {
        console.error('Map List Server: Socket error:', err.message);
    });

    socket.on('end', () => {
        console.log('Map List Server: Client disconnected.');
    });
});

mapListServer.listen(19204, () => {
    console.log('Map List Server: TCP server listening on port 19204...');
});
