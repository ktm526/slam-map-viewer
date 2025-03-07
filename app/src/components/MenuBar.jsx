import React, { useState, useEffect } from 'react';
import './MenuBar.css';

// SVG 파일 경로를 가져옴 
import RealTimeIcon from '../icons/realtime.svg';
import SlamIcon from '../icons/slam.svg';
import PathIcon from '../icons/path.svg';
import StationIcon from '../icons/station.svg';
//import DownloadIcon from '../icons/download.svg';
//import UploadIcon from '../icons/upload.svg';
import SettingsIcon from '../icons/settings.svg';
//import SaveIcon from '../icons/save.svg';

const menuItems = [
    { icon: RealTimeIcon, text: '실시간 위치' },
    { icon: SlamIcon, text: 'SLAM 시작' },
    { icon: PathIcon, text: '경로 추가' },
    { icon: StationIcon, text: '스테이션 추가' },
    // { icon: SaveIcon, text: '맵 저장' },
    // { icon: DownloadIcon, text: '맵 다운로드' },
    // { icon: UploadIcon, text: '맵 업로드' },
    { icon: SettingsIcon, text: '설정' },
];

const MenuBar = ({ activeMenu, setActiveMenu, mapData, amrIp, startPushData, stopPushData }) => {


    const [loadingText, setLoadingText] = useState("");

    useEffect(() => {
        if (activeMenu === 0 || activeMenu === 1) {
            const interval = setInterval(() => {
                setLoadingText((prev) => (prev === "..." ? "." : prev + "."));
            }, 500);
            return () => clearInterval(interval);
        }
    }, [activeMenu]);

    const handleMenuClick = async (index) => {
        if (index === 4) { // 맵 저장 버튼
            setActiveMenu(index);
        } else if (index === 3) { // 스테이션 추가 버튼
            if (activeMenu === index) {
                setActiveMenu(null); // 스테이션 추가 모드 해제
            } else {
                setActiveMenu(index); // 스테이션 추가 모드 활성화
            }
        } else if (index === 2) {
            if (activeMenu === index) {
                setActiveMenu(null); // 스테이션 추가 모드 해제
            } else {
                setActiveMenu(index); // 스테이션 추가 모드 활성화
            }
        }
        else if (index === 0) {
            if (activeMenu === index) {
                setActiveMenu(null); // 활성화 해제
                setLoadingText("");
                await stopPushData(); // TCP 연결 해제
            } else {
                setActiveMenu(index); // 활성화
                await startPushData(); // TCP 연결 시작
            }
        } else if (index === 1) {
            if (!amrIp) {
                alert("AMR IP가 설정되지 않았습니다. 설정에서 IP를 입력하세요.");
                return;
            }

            if (activeMenu === index) {
                // Stop SLAM
                try {
                    const response = await window.electronAPI.endSlam(amrIp);
                    console.log('End SLAM Response:', response);
                    setActiveMenu(null);
                    setLoadingText("");
                } catch (error) {
                    console.error('Error stopping SLAM:', error);
                    alert('SLAM 종료 중 오류가 발생했습니다.');
                }
            } else {
                // Start SLAM
                try {
                    const response = await window.electronAPI.startSlam(amrIp, 2, true); // 2D real-time SLAM
                    console.log('Start SLAM Response:', response);
                    setActiveMenu(index);
                } catch (error) {
                    console.error('Error starting SLAM:', error);
                    alert('SLAM 시작 중 오류가 발생했습니다.');
                }
            }
        }
    };

    return (
        <div className="menu-bar">
            {menuItems.map((item, index) => (
                <div
                    key={index}
                    className={`menu-item ${activeMenu === index ? "active" : ""} ${activeMenu !== null && activeMenu !== index ? "disabled" : ""
                        }`}
                    onClick={() => handleMenuClick(index)}
                >
                    <img src={item.icon} alt={item.text} className="menu-icon" />
                    <div className="menu-text">
                        {index === 0 && activeMenu === 0
                            ? `위치 관제 중${loadingText}`
                            : index === 1 && activeMenu === 1
                                ? `SLAM 진행 중${loadingText}`
                                : item.text}
                    </div>
                    {index < menuItems.length - 1 && <div className="menu-divider"></div>}
                </div>
            ))}
        </div>
    );
};

export default MenuBar;
