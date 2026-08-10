import React, { useState } from 'react';
import {
  X, Folder, Upload, HardDrive, LayoutGrid, Sparkles,
  Check, User, LogOut, Sliders, Shield, Globe
} from 'lucide-react';

/* 1. Files & Drive Manager Modal */
export const FilesModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-6 relative animate-in fade-in zoom-in duration-200">
        <button onClick={onClose} className="absolute left-4 top-4 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 mb-4">
          <Folder className="w-6 h-6 text-blue-600" />
          <h3 className="font-bold text-lg text-slate-800">إدارة الملفات و Google Drive</h3>
        </div>
        <div className="space-y-3 py-2">
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-blue-500 transition-colors cursor-pointer">
            <Upload className="w-8 h-8 text-blue-500 mx-auto mb-2" />
            <div className="text-sm font-semibold text-slate-700">اسحب الملفات هنا أو اضغط للرفع</div>
            <div className="text-xs text-slate-400 mt-1">يدعم PDF, TXT, DOCX, PNG, JPG (حتى 50MB)</div>
          </div>
          <button
            onClick={() => alert('تم الاتصال بـ Google Drive بنجاح!')}
            className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 px-4 rounded-xl transition-colors text-sm"
          >
            <HardDrive className="w-4 h-4 text-amber-500" />
            <span>ربط حساب Google Drive</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/* 2. Gems / Custom Assistants Modal */
export const GemsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  const gemsList = [
    { title: 'مساعد البرمجة والتكويد', desc: 'كتابة واكتشاف الأخطاء البرمجية بلغات متعددة', color: 'bg-blue-500' },
    { title: 'مساعد الكتابة الإبداعية', desc: 'صياغة المقالات، السير الذاتية، والإيميلات الاحترافية', color: 'bg-emerald-500' },
    { title: 'محلل البيانات و الإحصاء', desc: 'تحليل الجداول الجاهزة واستخراج الأفكار الرئيسية', color: 'bg-purple-500' },
    { title: 'مساعد الترجمة الفورية', desc: 'ترجمة دقيقة تحافظ على سياق المعنى الأصلي', color: 'bg-amber-500' }
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl p-6 relative">
        <button onClick={onClose} className="absolute left-4 top-4 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 mb-4">
          <LayoutGrid className="w-6 h-6 text-purple-600" />
          <h3 className="font-bold text-lg text-slate-800">إضافات Mijlai Gems الجاهزة</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          {gemsList.map((g, idx) => (
            <div key={idx} className="border border-slate-200 hover:border-purple-300 rounded-2xl p-4 hover:shadow-md transition-all cursor-pointer bg-slate-50/50">
              <div className={`w-8 h-8 rounded-xl ${g.color} text-white flex items-center justify-center mb-2 font-bold text-xs`}>
                ✦
              </div>
              <div className="font-bold text-xs text-slate-800 mb-1">{g.title}</div>
              <div className="text-[11px] text-slate-500 leading-snug">{g.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* 3. Pro Subscription Modal */
export const UpgradeModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 relative">
        <button onClick={onClose} className="absolute left-4 top-4 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
        <div className="text-center py-2 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-2">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-xl text-slate-900">Mijlai Pro</h3>
          <p className="text-xs text-slate-500">احصل على سرعة غير محدودة، أولوية المعالجة، ونماذج التفكير المعقدة</p>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-right text-xs space-y-2 text-slate-700">
            <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /><span>وصول كامل لنماذج Thinking و Pro</span></div>
            <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /><span>رفع ملفات غير محدود بحد أقصى 2GB</span></div>
            <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /><span>دعم Canvas التفاعلي المتطور</span></div>
          </div>
          <button
            onClick={() => {
              alert('شكراً لاختيارك Mijlai Pro!');
              onClose();
            }}
            className="w-full bg-[#1a73e8] hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors text-sm shadow-md"
          >
            اشترك الآن بـ $19/شهرياً
          </button>
        </div>
      </div>
    </div>
  );
};

/* 4. Prompt Edit / Style Customization Modal */
export const PromptEditModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  customPrompt: string;
  onSavePrompt: (prompt: string) => void;
}> = ({ isOpen, onClose, customPrompt, onSavePrompt }) => {
  const [val, setVal] = useState(customPrompt);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-6 relative">
        <button onClick={onClose} className="absolute left-4 top-4 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 mb-3">
          <Sliders className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-base text-slate-800">تخصيص أسلوب الردود (Prompt Customization)</h3>
        </div>
        <p className="text-xs text-slate-500 mb-3">حدد تعليمات النظام الخاصة للنموذج لتطبيقها في كافة المحادثات:</p>
        <textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="مثال: أجب دائماً باختصار وبأسلوب برمجي مباشر بلغة عربية سليمة..."
          rows={5}
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs text-slate-800 outline-none focus:border-blue-500 resize-none leading-relaxed"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs text-slate-600 hover:bg-slate-100">إلغاء</button>
          <button
            onClick={() => {
              onSavePrompt(val);
              onClose();
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold"
          >
            حفظ التغييرات
          </button>
        </div>
      </div>
    </div>
  );
};

/* 5. User Profile Modal */
export const ProfileModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  onChangeName: (name: string) => void;
}> = ({ isOpen, onClose, userName, onChangeName }) => {
  const [nameInput, setNameInput] = useState(userName);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6 relative text-center">
        <button onClick={onClose} className="absolute left-4 top-4 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
        <div className="w-16 h-16 rounded-full bg-[#1e8e3e] text-white text-2xl font-bold flex items-center justify-center mx-auto mb-3 shadow-md">
          {nameInput ? nameInput.charAt(0).toUpperCase() : 'M'}
        </div>
        <h3 className="font-bold text-lg text-slate-900 mb-1">{userName}</h3>
        <p className="text-xs text-slate-500 mb-4">mhmodijla3@gmail.com</p>

        <div className="text-right space-y-2 mb-4">
          <label className="text-xs font-semibold text-slate-700">تعديل الاسم المعروض:</label>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              onChangeName(nameInput);
              onClose();
            }}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-xl text-xs"
          >
            حفظ
          </button>
          <button
            onClick={() => {
              alert('تم تسجيل الخروج بنجاح.');
              onClose();
            }}
            className="px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-xs flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      </div>
    </div>
  );
};
