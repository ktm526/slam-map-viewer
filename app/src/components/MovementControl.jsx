import React, { useState, useRef } from "react";
import "./MovementControl.css";

// 기존 아이콘
import forwardIcon from "../icons/forward.svg";
import backwardIcon from "../icons/backward.svg";
import leftturnIcon from "../icons/leftturn.svg";
import rightturnIcon from "../icons/rightturn.svg";
import movestopIcon from "../icons/movestop.svg";
import movementIcon from "../icons/movement.svg";
// 새 리프트 아이콘 (프로젝트에 추가되어 있다고 가정)
import liftUpIcon from "../icons/liftup.svg";
import liftDownIcon from "../icons/liftdown.svg";
import liftStopIcon from "../icons/liftstop.svg";

const MovementControl = ({ amrIp }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const requestInterval = useRef(null); // 요청 반복 인터벌 참조
  const isErrorNotified = useRef(false); // 오류 알림 여부 추적

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

    console.log("Starting movement request:", direction);

    // 반복적으로 메시지 보내기
    requestInterval.current = setInterval(() => {
      console.log("Sending movement request:", direction);
      window.electronAPI
        .sendTcpRequest(amrIp, direction)
        .then((response) => {
          console.log("Response from AMR:", response);
        })
        .catch((error) => {
          console.error("Error sending TCP request:", error);
          if (!isErrorNotified.current) {
            isErrorNotified.current = true; // 한 번만 알림 표시
            setTimeout(() => {
              isErrorNotified.current = false; // 알림 후 플래그 초기화
            }, 1000); // 1초 후 플래그 초기화
          }
          clearInterval(requestInterval.current); // 인터벌 정리
          requestInterval.current = null;
        });
    }, 100); // 100ms마다 요청
  };

  const handleButtonUp = () => {
    if (requestInterval.current) {
      clearInterval(requestInterval.current); // 인터벌 정리
      requestInterval.current = null;
      console.log("Movement request stopped");
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

          {/* 리프트 업 */}
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

          {/* 리프트 다운 */}
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
