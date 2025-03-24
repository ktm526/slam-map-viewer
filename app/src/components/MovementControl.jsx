import React, { useState, useRef } from "react";
import "./MovementControl.css";

// 기존 아이콘
import forwardIcon from "../icons/forward.svg";
import backwardIcon from "../icons/backward.svg";
import leftturnIcon from "../icons/leftturn.svg";
import rightturnIcon from "../icons/rightturn.svg";
import movestopIcon from "../icons/movestop.svg";
import movementIcon from "../icons/movement.svg";

// 새 리프트 아이콘
import liftUpIcon from "../icons/liftup.svg";
import liftDownIcon from "../icons/liftdown.svg";
import liftStopIcon from "../icons/liftstop.svg";

function createJackPacket(apiNumber) {
  // 16바이트 헤더 (JSON 바디 없음)
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);

  // 0~1 바이트: 매직 넘버 (0x55AA)
  view.setUint16(0, 0x55aa, false); // Big Endian
  // 2~3 바이트: API 번호
  view.setUint16(2, apiNumber, false);
  // 4~7 바이트: 데이터 길이 = 0
  view.setUint32(4, 0, false);
  // 8~11 바이트: 시퀀스 번호 = 0
  view.setUint32(8, 0, false);
  // 12~15 바이트: 예약 = 0
  view.setUint32(12, 0, false);

  return buffer;
}

// 예: 이동(전진/후진/좌/우/정지)을 위한 API 패킷을 만드는 함수 (기존 방식)
function createMovementPacket(direction) {
  // 여기서는 예시로, main 프로세스에서 19205 포트로
  // API 번호 2010(0x07DA) 등에 맞춰서 패킷을 생성한다고 가정
  // 실제 로직은 프로젝트 상황에 맞게 수정하세요.

  // 간단히 JSON 바디를 "direction"만 포함한다고 예시:
  const jsonStr = JSON.stringify({ direction });
  const body = new TextEncoder().encode(jsonStr);

  // 16바이트 헤더
  const buffer = new Uint8Array(16 + body.length);
  const view = new DataView(buffer.buffer);

  // 매직 넘버 (예시: 0x5A01)
  view.setUint8(0, 0x5a);
  view.setUint8(1, 0x01);
  // 2~3 바이트: 시리얼(랜덤) - 예시로 0
  view.setUint16(2, 0, false);
  // 4~7 바이트: 데이터 길이
  view.setUint32(4, body.length, false);
  // 8~9 바이트: API 번호 (예: 2010(0x07DA))
  view.setUint16(8, 0x07da, false);
  // 10~15 바이트: 예약
  // 모두 0으로 남김

  // JSON 바디 복사
  buffer.set(body, 16);

  return buffer;
}

const MovementControl = ({ amrIp }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const requestInterval = useRef(null); // 반복 요청 인터벌
  const isErrorNotified = useRef(false); // 오류 알림 플래그

  const handleContainerClick = (e) => {
    const isButtonOrIcon =
      e.target.classList.contains("control-button") ||
      e.target.tagName === "IMG"; // 버튼 또는 아이콘 클릭 시 접힘 방지
    if (isButtonOrIcon) {
      e.stopPropagation();
      return;
    }
    setIsExpanded((prev) => !prev);
  };

  const handleButtonDown = (direction) => {
    if (requestInterval.current) {
      console.warn("Request already running!");
      return;
    }

    if (!amrIp) {
      return;
    }

    console.log("Starting request:", direction);

    requestInterval.current = setInterval(() => {
      console.log("Sending request:", direction);

      let packet;
      let port;

      // ── 리프트 API ──
      if (direction === "liftup") {
        // 상승: API 번호 0x17B6
        packet = createJackPacket(0x17b6);
        port = 19204; // 예시
      } else if (direction === "liftdown") {
        // 하강: API 번호 0x17B7
        packet = createJackPacket(0x17b7);
        port = 19204;
      } else if (direction === "liftstop") {
        // 정지: API 번호 0x17B8
        packet = createJackPacket(0x17b8);
        port = 19204;
      }
      // ── 이동 API ──
      else {
        // 예시: 이동은 포트 19205
        port = 19205;
        packet = createMovementPacket(direction);
      }

      window.electronAPI
        .sendTcpRequest2(amrIp, port, packet)
        .then((response) => {
          console.log("Response from AMR:", response);
        })
        .catch((error) => {
          console.error("Error sending TCP request:", error);
          if (!isErrorNotified.current) {
            isErrorNotified.current = true; // 한 번만 알림
            setTimeout(() => {
              isErrorNotified.current = false;
            }, 1000);
          }
          clearInterval(requestInterval.current);
          requestInterval.current = null;
        });
    }, 100); // 100ms마다 요청
  };

  const handleButtonUp = () => {
    if (requestInterval.current) {
      clearInterval(requestInterval.current);
      requestInterval.current = null;
      console.log("Request stopped");
    }
  };

  return (
    <div
      className={`movement-control-container ${
        isExpanded ? "expanded" : "collapsed"
      }`}
      onClick={handleContainerClick}
    >
      {isExpanded ? (
        <div className="movement-buttons">
          <div className="amr-label">AMR</div>
          <div className="lift-label">Lift</div>

          {/* 전진 */}
          <div className="button-container forward-container">
            <div
              className="control-button"
              onMouseDown={() => handleButtonDown("up")}
              onMouseUp={handleButtonUp}
              onMouseLeave={handleButtonUp}
            >
              <img src={forwardIcon} alt="forward" />
            </div>
          </div>

          {/* 후진 */}
          <div className="button-container backward-container">
            <div
              className="control-button"
              onMouseDown={() => handleButtonDown("down")}
              onMouseUp={handleButtonUp}
              onMouseLeave={handleButtonUp}
            >
              <img src={backwardIcon} alt="backward" />
            </div>
          </div>

          {/* 좌회전 */}
          <div className="button-container leftturn-container">
            <div
              className="control-button"
              onMouseDown={() => handleButtonDown("left")}
              onMouseUp={handleButtonUp}
              onMouseLeave={handleButtonUp}
            >
              <img src={leftturnIcon} alt="left turn" />
            </div>
          </div>

          {/* 우회전 */}
          <div className="button-container rightturn-container">
            <div
              className="control-button"
              onMouseDown={() => handleButtonDown("right")}
              onMouseUp={handleButtonUp}
              onMouseLeave={handleButtonUp}
            >
              <img src={rightturnIcon} alt="right turn" />
            </div>
          </div>

          {/* 정지 */}
          <div className="button-container stop-container">
            <div
              className="control-button"
              onMouseDown={() => handleButtonDown("stop")}
              onMouseUp={handleButtonUp}
              onMouseLeave={handleButtonUp}
            >
              <img src={movestopIcon} alt="stop" />
            </div>
          </div>

          {/* 세로 디바이더 */}
          <div className="vertical-divider"></div>

          {/* 리프트 상승 */}
          <div className="button-container liftup-container">
            <div
              className="control-button"
              onMouseDown={() => handleButtonDown("liftup")}
              onMouseUp={handleButtonUp}
              onMouseLeave={handleButtonUp}
            >
              <img src={liftUpIcon} alt="lift up" />
            </div>
          </div>

          {/* 리프트 정지 */}
          <div className="button-container liftstop-container">
            <div
              className="control-button"
              onMouseDown={() => handleButtonDown("liftstop")}
              onMouseUp={handleButtonUp}
              onMouseLeave={handleButtonUp}
            >
              <img src={liftStopIcon} alt="lift stop" />
            </div>
          </div>

          {/* 리프트 하강 */}
          <div className="button-container liftdown-container">
            <div
              className="control-button"
              onMouseDown={() => handleButtonDown("liftdown")}
              onMouseUp={handleButtonUp}
              onMouseLeave={handleButtonUp}
            >
              <img src={liftDownIcon} alt="lift down" />
            </div>
          </div>
        </div>
      ) : (
        <div className="collapsed-content">
          <img src={movementIcon} alt="movement" className="movement-icon" />
        </div>
      )}
    </div>
  );
};

export default MovementControl;
