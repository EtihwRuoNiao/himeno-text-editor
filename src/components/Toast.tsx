import React from 'react';
import { X } from 'lucide-react';

interface ToastProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  variant?: string;
}

export const Toast: React.FC<ToastProps> = ({ message, isVisible, onClose, variant = 'default' }) => {
  const baseStyles: Record<string, { container: string, text: string, button: string }> = {
    default: {
      container: "bg-gray-800 border-gray-700",
      text: "text-white",
      button: "text-gray-400 hover:text-white",
    },
    alarm: {
      container: "bg-red-100 border-red-300",
      text: "text-red-900",
      button: "text-red-400 hover:text-red-600",
    },
  };

  // 助手气泡调色板：以语义名为主（对应 manifest 的 bubble.variant）
  const palette: Record<string, { container: string, text: string, button: string }> = {
    pink: {
      container: "bg-pink-100 border-pink-300",
      text: "text-pink-900",
      button: "text-pink-400 hover:text-pink-600",
    },
    pinkDeep: {
      container: "bg-pink-200 border-pink-400",
      text: "text-pink-900",
      button: "text-pink-400 hover:text-pink-600",
    },
    yellow: {
      container: "bg-yellow-200 border-yellow-400",
      text: "text-yellow-900",
      button: "text-yellow-400 hover:text-yellow-600",
    },
    yellowDeep: {
      container: "bg-yellow-300 border-yellow-500",
      text: "text-yellow-900",
      button: "text-yellow-400 hover:text-yellow-600",
    },
    green: {
      container: "bg-green-100 border-green-300",
      text: "text-green-900",
      button: "text-green-400 hover:text-green-600",
    },
    gray: {
      container: "bg-gray-200 border-gray-400",
      text: "text-gray-900",
      button: "text-gray-400 hover:text-gray-600",
    },
    blue: {
      container: "bg-blue-100 border-blue-300",
      text: "text-blue-900",
      button: "text-blue-400 hover:text-blue-600",
    },
    purple: {
      container: "bg-purple-100 border-purple-300",
      text: "text-purple-900",
      button: "text-purple-400 hover:text-purple-600",
    },
  };

  // 旧版以角色 id 命名的 variant 保持原配色不变（向后兼容已持久化的调用方）
  const legacyVariantAlias: Record<string, string> = {
    himeno: 'pink',
    aika: 'pinkDeep',
    sakura: 'yellow',
    menoa: 'yellowDeep',
    yume: 'green',
    nino: 'gray',
  };

  const currentStyle = baseStyles[variant]
    || palette[legacyVariantAlias[variant] ?? variant]
    || palette.gray;

  // 用纯 CSS 过渡承载显隐：避免 motion 的 WAAPI 动画与内联 opacity 竞争
  // （实测：motion 版本会在入场/退场后约 500ms 出现单帧 opacity 反转闪动）
  return (
    <div
      aria-hidden={!isVisible}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
        transition: 'opacity 180ms ease-out, transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
      className="fixed top-5 left-1/2 -translate-x-1/2 z-[200]"
    >
      <div onClick={() => { if (variant !== 'alarm') onClose(); }} className={`px-6 py-3 rounded-lg shadow-lg flex items-center gap-4 border ${currentStyle.container}`}>
        <span className={`font-medium ${currentStyle.text}`}>{message}</span>
        <button onClick={onClose} className={currentStyle.button}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
};