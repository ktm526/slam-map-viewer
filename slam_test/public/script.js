// script.js
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const ipInput = document.getElementById('ipInput');
const slamCanvas = document.getElementById('slamCanvas');
const ctx = slamCanvas.getContext('2d');

// 실제 그려질 해상도(픽셀 단위) 지정
slamCanvas.width = 800;
slamCanvas.height = 600;

// 주기적으로 이미지를 갱신하기 위한 interval ID
let intervalId = null;

/**
 * "스캔 시작" 버튼 클릭 이벤트
 */
startBtn.addEventListener('click', () => {
    const ip = ipInput.value.trim();
    if (!ip) {
        alert('IP 주소를 입력해주세요.');
        return;
    }

    // 서버에 POST 요청으로 SLAM 시작 지시
    fetch('/start-slam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // 이전에 interval이 있었다면 정리
                if (intervalId) {
                    clearInterval(intervalId);
                }
                // 일정 주기로 slam 이미지를 가져와 Canvas에 표시
                intervalId = setInterval(fetchAndDrawImage, 1000);
            } else {
                alert(`스캔 시작 실패: ${data.error || '알 수 없는 오류'}`);
            }
        })
        .catch(err => {
            console.error(err);
            alert('스캔 시작 중 오류가 발생했습니다.');
        });
});

/**
 * "스캔 종료" 버튼 클릭 이벤트
 */
stopBtn.addEventListener('click', () => {
    fetch('/stop-slam', {
        method: 'POST'
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert(data.message || '스캔이 종료되었습니다.');
                // 이미지 갱신 중지
                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }
                // 캔버스 초기화
                ctx.clearRect(0, 0, slamCanvas.width, slamCanvas.height);
            } else {
                alert(`스캔 종료 실패: ${data.error || '알 수 없는 오류'}`);
            }
        })
        .catch(err => {
            console.error(err);
            alert('스캔 종료 중 오류가 발생했습니다.');
        });
});

/**
 * slam 이미지를 가져와 Canvas에 그리는 함수
 */
function fetchAndDrawImage() {
    fetch('/slam-image')
        .then(response => {
            if (!response.ok) {
                throw new Error('slam 이미지를 가져오지 못했습니다.');
            }
            return response.blob();
        })
        .then(blob => {
            // Blob 데이터를 이미지 객체로 변환 후 Canvas에 그림
            const img = new Image();
            img.onload = () => {
                // 캔버스 초기화
                ctx.clearRect(0, 0, slamCanvas.width, slamCanvas.height);
                // 이미지 그리기 (캔버스 크기에 맞춰 스케일링)
                ctx.drawImage(img, 0, 0, slamCanvas.width, slamCanvas.height);
            };
            img.src = URL.createObjectURL(blob);
        })
        .catch(err => {
            console.error('이미지 로드 에러:', err);
        });
}
