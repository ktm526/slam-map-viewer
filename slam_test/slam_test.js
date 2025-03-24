// server.js
const express = require('express');
const net = require('net');
const http = require('http');
const path = require('path');

const app = express();
app.use(express.json());

// 로봇 IP를 전역(또는 다른 저장소)에서 관리
let currentRobotIP = null;

/**
 * 1) TCP로 로봇에 SLAM 시작(6100) 요청을 보내는 엔드포인트
 */
app.post('/start-slam', (req, res) => {
    const { ip } = req.body;
    if (!ip) {
        return res.status(400).json({ success: false, error: 'IP가 전달되지 않았습니다.' });
    }

    currentRobotIP = ip;

    // TCP 소켓 생성
    const client = new net.Socket();

    // 로봇의 19210 포트로 연결
    client.connect(19210, ip, () => {
        console.log(`로봇(${ip}:19210)에 연결되었습니다.`);

        // robot_other_slam_req (6100) 요청으로, 2D 실시간 스캔 설정(JSON)
        const slamRequest = {
            slam_type: 2,       // 2D 실시간 스캔
            real_time: true,    // 실시간 스캔 데이터 전송
            screen_width: 800,  // 필요시 지정
            screen_height: 600  // 필요시 지정
        };

        // 로봇에 JSON 형태로 전송 (실제 프로토콜에 맞춰 변환 필요할 수 있음)
        client.write(JSON.stringify(slamRequest));
    });

    // 로봇으로부터 데이터 수신
    client.on('data', (data) => {
        console.log('로봇 응답(시작):', data.toString());

        // 응답(JSON)을 파싱해 에러코드, 메시지 등을 처리 가능
        // 예: let responseObj = JSON.parse(data.toString());

        // 소켓 종료
        client.destroy();

        // 클라이언트(웹)로 성공 응답
        return res.json({ success: true, message: '2D 실시간 스캔을 시작했습니다.' });
    });

    // 에러 처리
    client.on('error', (err) => {
        console.error('로봇 TCP 연결 에러(시작):', err.message);
        return res.status(500).json({ success: false, error: err.message });
    });
});

/**
 * 2) TCP로 로봇에 SLAM 종료(6101) 요청을 보내는 엔드포인트
 */
app.post('/stop-slam', (req, res) => {
    if (!currentRobotIP) {
        return res.status(400).json({ success: false, error: '로봇 IP가 설정되지 않았습니다.' });
    }

    // TCP 소켓 생성
    const client = new net.Socket();

    // 로봇의 19210 포트로 연결
    client.connect(19210, currentRobotIP, () => {
        console.log(`로봇(${currentRobotIP}:19210)에 연결되었습니다. (종료 요청)`);

        // robot_other_endslam_req (6101)는 JSON 데이터 영역이 없음
        // 여기서는 빈 JSON만 전송 예시
        client.write(JSON.stringify({}));
    });

    // 로봇으로부터 데이터 수신
    client.on('data', (data) => {
        console.log('로봇 응답(종료):', data.toString());

        // 여기서 응답(JSON)을 파싱해 에러코드, 메시지 등을 처리 가능
        // 예: let responseObj = JSON.parse(data.toString());

        // 소켓 종료
        client.destroy();

        // 클라이언트(웹)로 성공 응답
        return res.json({ success: true, message: '스캔을 종료했습니다.' });
    });

    // 에러 처리
    client.on('error', (err) => {
        console.error('로봇 TCP 연결 에러(종료):', err.message);
        return res.status(500).json({ success: false, error: err.message });
    });
});

/**
 * 3) 로봇에서 스캔 이미지를 받아오는 엔드포인트
 *    - 로봇 IP:9301/slam 에 HTTP 요청을 보낸 후, 받은 이미지를 그대로 클라이언트에 전송
 */
app.get('/slam-image', (req, res) => {
    if (!currentRobotIP) {
        return res.status(400).send('로봇 IP가 설정되지 않았습니다.');
    }

    // 로봇의 9301 포트에 /slam 요청
    http.get(`http://${currentRobotIP}:9301/slam`, (response) => {
        if (response.statusCode !== 200) {
            res.status(response.statusCode).send('이미지를 받아오지 못했습니다.');
            return;
        }
        // 응답 헤더 세팅 (PNG 이미지라 가정)
        res.setHeader('Content-Type', 'image/png');
        // 로봇에서 온 이미지를 스트리밍하여 그대로 전달
        response.pipe(res);
    }).on('error', (err) => {
        console.error('slam 이미지 요청 에러:', err.message);
        res.status(500).send('slam 이미지를 가져오는 중 오류가 발생했습니다.');
    });
});

// 정적 파일(HTML/CSS/JS 등) 제공: public 폴더를 사용
app.use(express.static(path.join(__dirname, 'public')));

// 서버 구동
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 구동 중입니다.`);
});
