const net = require('net');
const fs = require('fs');

/**
 * 헤더 파싱 함수 (새로운 헤더 포맷)
 * - header[4~7]에 바디의 길이가 빅엔디안 형식으로 저장되어 있음
 */
function parseHeader(buffer) {
    const bodyLength = buffer.readUInt32BE(4);
    return { bodyLength };
}

/**
 * sendTcpRequest2 함수
 * - 지정된 ipAddress, port로 message(Buffer)를 전송하고,
 *   응답 메시지(헤더+바디)를 받아 JSON으로 파싱하여 반환합니다.
 */
function sendTcpRequest2(ipAddress, port, message) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        console.log('Sending TCP request to:', ipAddress, port);
        client.connect(port, ipAddress, () => {
            client.write(message);
        });

        let responseBuffer = Buffer.alloc(0);
        client.on('data', (data) => {
            responseBuffer = Buffer.concat([responseBuffer, data]);
            // 최소 16바이트 헤더가 수신되었는지 확인
            if (responseBuffer.length >= 16) {
                const header = parseHeader(responseBuffer.slice(0, 16));
                // 헤더에 명시된 바디 길이만큼 데이터가 수신되었으면 처리
                if (responseBuffer.length >= 16 + header.bodyLength) {
                    const bodyBuffer = responseBuffer.slice(16, 16 + header.bodyLength);
                    try {
                        const jsonData = JSON.parse(bodyBuffer.toString('utf8'));
                        console.log('Received response from server:', jsonData);
                        resolve(jsonData);
                        client.destroy();
                    } catch (err) {
                        reject('Failed to parse JSON response');
                        client.destroy();
                    }
                }
            }
        });

        client.on('error', (err) => {
            console.error('Client connection error:', err.message);
            reject(err.message);
            client.destroy();
        });

        client.on('close', () => {
            console.log('TCP client connection closed');
        });
    });
}

/**
 * handleMoveToStation 함수
 * - 스테이션 정보를 받아 전송할 메시지를 구성합니다.
 * - 1) JSON 데이터 생성
 * - 2) JSON 문자열을 UTF-8 인코딩하여 body 생성
 * - 3) 16바이트 헤더 생성
 *      header[0~3]: 고정 값 (0x5a, 0x01, 0x00, 0x01)
 *      header[4~7]: body 길이 (빅엔디안)
 *      header[8~9]: API ID (0x0b, 0xeb: 3051)
 *      header[10~15]: 0 (고정)
 * - 4) 헤더와 body를 합쳐 message 생성 후 sendTcpRequest2 호출
 */
function handleMoveToStation(station, ipAddress, port) {
    // 1) 전송할 JSON 데이터 생성
    const requestData = {
        id: station.instanceName, // 예: "LM3"
        source_id: "SELF_POSITION",
    };
    console.log("Request data:", requestData);

    // 2) JSON 문자열 직렬화 → UTF-8 인코딩
    const jsonStr = JSON.stringify(requestData);
    const bodyBuffer = Buffer.from(jsonStr, 'utf8');

    // 3) 16바이트 헤더 생성
    const header = Buffer.alloc(16);
    header[0] = 0x5a; // 시작 바이트
    header[1] = 0x01;
    header[2] = 0x00;
    header[3] = 0x01;
    header.writeUInt32BE(bodyBuffer.length, 4); // body 길이 기록 (4~7)
    header[8] = 0x03; // API ID 상위 바이트
    header[9] = 0xF1; // API ID 하위 바이트
    // header[10~15]는 기본값 0

    // 4) 헤더와 body를 합쳐 message 생성
    const message = Buffer.concat([header, bodyBuffer]);

    // 5) TCP 전송
    return sendTcpRequest2(ipAddress, port, message);
}

/**
 * 테스트용 TCP 서버 생성 함수
 * - 클라이언트로부터 메시지를 받으면 헤더와 바디를 파싱하고,
 *   JSON 데이터를 확인한 후 응답 메시지를 구성하여 전송합니다.
 */
function startTestServer(port) {
    const server = net.createServer((socket) => {
        console.log('Test server: Client connected');
        let buffer = Buffer.alloc(0);
        socket.on('data', (data) => {
            buffer = Buffer.concat([buffer, data]);
            // 최소 16바이트 헤더 수신 확인
            if (buffer.length >= 16) {
                const header = parseHeader(buffer.slice(0, 16));
                if (buffer.length >= 16 + header.bodyLength) {
                    const body = buffer.slice(16, 16 + header.bodyLength);
                    try {
                        const jsonData = JSON.parse(body.toString('utf8'));
                        console.log('Test server: Received data:', jsonData);

                        // 응답 데이터 구성 (예: 수신한 스테이션 id를 포함)
                        const responseData = {
                            success: true,
                            received: jsonData.id,
                        };
                        const responseJson = JSON.stringify(responseData);
                        const responseBody = Buffer.from(responseJson, 'utf8');

                        // 응답 헤더 생성 (송신 코드와 동일한 포맷)
                        const responseHeader = Buffer.alloc(16);
                        responseHeader[0] = 0x5a;
                        responseHeader[1] = 0x01;
                        responseHeader[2] = 0x00;
                        responseHeader[3] = 0x01;
                        responseHeader.writeUInt32BE(responseBody.length, 4);
                        responseHeader[8] = 0x0b;
                        responseHeader[9] = 0xeb;

                        const fullResponse = Buffer.concat([responseHeader, responseBody]);
                        socket.write(fullResponse);
                    } catch (err) {
                        console.error('Test server: Failed to parse JSON:', err);
                    }
                }
            }
        });

        socket.on('end', () => {
            console.log('Test server: Client disconnected');
        });
    });

    server.listen(port, () => {
        console.log(`Test server listening on port ${port}`);
    });

    return server;
}

// ----- 테스트 실행 ----- //
const testPort = 19204;
const testIP = '192.168.45.115';

// 테스트용 TCP 서버 시작
const server = startTestServer(testPort);

// 테스트 스테이션 객체 (예시)
const testStation = {
    instanceName: "LM3",
};

// handleMoveToStation 함수 호출하여 메시지 전송 및 응답 테스트
handleMoveToStation(testStation, testIP, testPort)
    .then((response) => {
        console.log('Final response received:', response);
        // 결과를 result.txt 파일에 저장
        fs.writeFile('result.txt', JSON.stringify(response, null, 2), (err) => {
            if (err) {
                console.error('Error writing result to file:', err);
            } else {
                console.log('Result saved to result.txt');
            }
            server.close();
        });
    })
    .catch((error) => {
        console.error('Error during test:', error);
        // 에러 메시지도 파일에 저장
        fs.writeFile('result.txt', 'Error during test: ' + error, (err) => {
            if (err) {
                console.error('Error writing error to file:', err);
            }
            server.close();
        });
    });
