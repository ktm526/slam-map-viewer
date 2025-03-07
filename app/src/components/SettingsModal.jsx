import React, { useState, useEffect } from "react";
import "./SettingsModal.css";

const SettingsModal = ({ isOpen, onClose, onSave }) => {
  const [amrIp, setAmrIp] = useState("");

  useEffect(() => {
    // 저장된 AMR IP 불러오기
    const savedAmrIp = localStorage.getItem("amrIp");
    if (savedAmrIp) {
      setAmrIp(savedAmrIp);
    }
  }, []);

  const handleSave = async () => {
    localStorage.setItem("amrIp", amrIp); // 렌더러 측에서도 저장 (UI 동기화를 위해)
    // 메인 프로세스로 값 전달 후 Promise가 resolve 될 때까지 기다림
    await window.electronAPI.setAmrIp(amrIp);
    onSave(amrIp);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="settings-modal">
      <div className="settings-modal-content">
        <h2>설정</h2>
        <label>
          AMR IP:
          <input
            type="text"
            value={amrIp}
            onChange={(e) => setAmrIp(e.target.value)}
            placeholder="192.168.x.x"
          />
        </label>
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
