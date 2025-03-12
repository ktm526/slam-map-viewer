import React, { useState, useEffect } from "react";
import "./SettingsModal.css";

const SettingsModal = ({ isOpen, onClose, onSave }) => {
  // 기존 설정 관련 state
  const [amrIp, setAmrIp] = useState("");
  const [previewImage, setPreviewImage] = useState(null);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [amrWidth, setAmrWidth] = useState("");
  const [amrHeight, setAmrHeight] = useState("");

  // 재배치(Relocate) 관련 state
  // relocateMode: "auto" (자동) 또는 "manual" (수동)
  const [relocateMode, setRelocateMode] = useState("auto");
  const [relocateX, setRelocateX] = useState("");
  const [relocateY, setRelocateY] = useState("");
  const [relocateAngle, setRelocateAngle] = useState("");
  let test_message = "";
  function test(test_message) {
    console.log(test_message);
  }

  useEffect(() => {
    // 저장된 AMR IP 불러오기
    const savedAmrIp = localStorage.getItem("amrIp");
    if (savedAmrIp) {
      setAmrIp(savedAmrIp);
    }
    // 저장된 이미지 불러오기 (data URL)
    const savedImage = localStorage.getItem("amrImage");
    if (savedImage) {
      setUploadedImage(savedImage);
      setPreviewImage(savedImage);
    }
    // 저장된 AMR 사이즈 불러오기
    const savedWidth = localStorage.getItem("amrWidth");
    const savedHeight = localStorage.getItem("amrHeight");
    if (savedWidth) setAmrWidth(savedWidth);
    if (savedHeight) setAmrHeight(savedHeight);
  }, []);

  // relocateMode가 auto이면 입력값 초기화
  useEffect(() => {
    if (relocateMode === "auto") {
      setRelocateX("");
      setRelocateY("");
      setRelocateAngle("");
    }
  }, [relocateMode]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        setUploadedImage(dataUrl);
        setPreviewImage(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    // 기존 설정값 저장
    localStorage.setItem("amrIp", amrIp);
    if (uploadedImage) {
      localStorage.setItem("amrImage", uploadedImage);
    }
    localStorage.setItem("amrWidth", amrWidth);
    localStorage.setItem("amrHeight", amrHeight);

    // 메인 프로세스로 AMR IP 전달
    await window.electronAPI.setAmrIp(amrIp);
    if (onSave) {
      onSave({ amrIp, amrImage: uploadedImage, amrWidth, amrHeight });
    }
    onClose();
  };

  const handleRelocateToggle = (e) => {
    // 체크되면 수동, 아니면 자동
    setRelocateMode(e.target.checked ? "manual" : "auto");
  };

  const handleRelocate = () => {
    // 포트: 19205, API number: 2002 (0x07D2)
    if (relocateMode === "manual") {
      const requestObj = {
        x: parseFloat(relocateX),
        y: parseFloat(relocateY),
        angle: parseFloat(relocateAngle),
      };
      const jsonStr = JSON.stringify(requestObj);
      const encoder = new TextEncoder();
      const data = encoder.encode(jsonStr); // 직렬화된 데이터
      const dataLength = data.length;
      // 헤더 생성: 16바이트, bytes 4-7에 데이터 길이(빅엔디안), bytes 8-9에 API number 0x07D2
      const header = new Uint8Array(16);
      header[0] = 0x5a;
      header[1] = 0x01;
      header[2] = 0x00;
      header[3] = 0x01;
      header[4] = (dataLength >> 24) & 0xff;
      header[5] = (dataLength >> 16) & 0xff;
      header[6] = (dataLength >> 8) & 0xff;
      header[7] = dataLength & 0xff;
      header[8] = 0x07;
      header[9] = 0xd2;
      header[10] = 0x00;
      header[11] = 0x00;
      header[12] = 0x00;
      header[13] = 0x00;
      header[14] = 0x00;
      header[15] = 0x00;
      // 메시지 = header + data
      const message = new Uint8Array(header.length + data.length);
      message.set(header, 0);
      message.set(data, header.length);
      console.log("Manual relocate message:", message);
      // TCP 요청 전송 (예: electronAPI에 sendTcpRequest 함수가 있다고 가정)
      window.electronAPI.sendTcpRequest2(amrIp, 19205, header);
    } else {
      // Auto 모드: 데이터 영역이 없음 (길이 0)
      const header = new Uint8Array(16);
      header[0] = 0x5a;
      header[1] = 0x01;
      header[2] = 0x00;
      header[3] = 0x01;
      header[4] = 0x00;
      header[5] = 0x00;
      header[6] = 0x00;
      header[7] = 0x00;
      header[8] = 0x07;
      header[9] = 0xd2;
      header[10] = 0x00;
      header[11] = 0x00;
      header[12] = 0x00;
      header[13] = 0x00;
      header[14] = 0x00;
      header[15] = 0x00;
      console.log("Auto relocate message:", header);
      window.electronAPI.sendTcpRequest2(amrIp, 19205, header);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-modal">
      <div className="settings-modal-content">
        <h2>설정</h2>
        <div className="settings-top">
          <div className="settings-row">
            <label>AMR IP</label>
            <input
              type="text"
              value={amrIp}
              onChange={(e) => setAmrIp(e.target.value)}
              placeholder="192.168.x.x"
            />
          </div>
        </div>
        <div className="settings-flex">
          <div className="preview-container">
            {previewImage ? (
              <img src={previewImage} alt="AMR Preview" />
            ) : (
              <span>이미지가 설정되지 않았습니다</span>
            )}
          </div>
          <div className="upload-container">
            <label>이미지 업로드</label>
            <input type="file" accept="image/*" onChange={handleImageChange} />
            <div className="size-inputs">
              <div>
                <label>가로 (mm)</label>
                <input
                  type="number"
                  value={amrWidth}
                  onChange={(e) => setAmrWidth(e.target.value)}
                  placeholder="예: 500"
                />
              </div>
              <div>
                <label>세로 (mm)</label>
                <input
                  type="number"
                  value={amrHeight}
                  onChange={(e) => setAmrHeight(e.target.value)}
                  placeholder="예: 300"
                />
              </div>
            </div>
          </div>
        </div>
        {/* 재배치 영역 */}
        <div className="relocate-section">
          <div className="relocate-header">
            <h3>AMR 재배치</h3>
            <div className="relocate-toggle">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={relocateMode === "manual"}
                  onChange={handleRelocateToggle}
                />
                <span className="slider"></span>
              </label>
              <span className="mode-label">
                {relocateMode === "manual" ? "수동" : "자동"}
              </span>
            </div>
          </div>
          <div className="relocate-inputs">
            <input
              type="number"
              placeholder="X 좌표"
              value={relocateX}
              onChange={(e) => setRelocateX(e.target.value)}
              disabled={relocateMode === "auto"}
            />
            <input
              type="number"
              placeholder="Y 좌표"
              value={relocateY}
              onChange={(e) => setRelocateY(e.target.value)}
              disabled={relocateMode === "auto"}
            />
            <input
              type="number"
              placeholder="Angle (rad)"
              value={relocateAngle}
              onChange={(e) => setRelocateAngle(e.target.value)}
              disabled={relocateMode === "auto"}
            />
          </div>
          <button className="relocate-button" onClick={handleRelocate}>
            재배치
          </button>
        </div>
        <div className="modal-divider"></div>
        <div className="modal-actions">
          <button className="save" onClick={handleSave}>
            저장
          </button>
          <button className="cancel" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
