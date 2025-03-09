import React, { useState, useEffect } from "react";
import "./SettingsModal.css";

const SettingsModal = ({ isOpen, onClose, onSave }) => {
  const [amrIp, setAmrIp] = useState("");
  const [previewImage, setPreviewImage] = useState(null);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [amrWidth, setAmrWidth] = useState("");
  const [amrHeight, setAmrHeight] = useState("");

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
    // 저장된 값들을 localStorage에 보관
    localStorage.setItem("amrIp", amrIp);
    if (uploadedImage) {
      localStorage.setItem("amrImage", uploadedImage);
    }
    localStorage.setItem("amrWidth", amrWidth);
    localStorage.setItem("amrHeight", amrHeight);

    // 메인 프로세스로 AMR IP 전달
    await window.electronAPI.setAmrIp(amrIp);
    // 부모 컴포넌트로 업데이트된 값 전달 (필요시)
    if (onSave) {
      onSave({ amrIp, amrImage: uploadedImage, amrWidth, amrHeight });
    }
    onClose();
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
