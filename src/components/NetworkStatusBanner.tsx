import React from 'react';
import { WifiOff } from 'lucide-react';

interface NetworkStatusBannerProps {
  isOnline: boolean;
}

export const NetworkStatusBanner: React.FC<NetworkStatusBannerProps> = ({ isOnline }) => {
  if (isOnline) return null;

  return (
    <div className="bg-amber-600 text-slate-950 font-semibold text-xs py-1.5 px-4 text-center flex items-center justify-center gap-2 sticky top-0 z-40 shadow-md">
      <WifiOff className="w-4 h-4" />
      <span>انقطع الاتصال بالشبكة! التطبيق سيعمل بالوضع المحلي فقط حتى عودة الاتصال.</span>
    </div>
  );
};
