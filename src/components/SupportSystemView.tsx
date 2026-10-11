import React, { useState } from 'react';
import { SupportTicket } from '../types/psychology';
import {
  Send,
  MessageSquare,
  Sparkles,
  HelpCircle,
  PlusCircle,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';
import { DuoMascot } from './DuoMascot';
import { playDuoSound } from '../utils/duoAudio';

interface SupportSystemViewProps {
  tickets: SupportTicket[];
  onAddTicket: (ticket: SupportTicket) => void;
  selectedChapterTitle?: string;
  selectedSectionTitle?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'mentor';
  text: string;
  time: string;
}

export const SupportSystemView: React.FC<SupportSystemViewProps> = ({
  tickets,
  onAddTicket,
  selectedChapterTitle,
  selectedSectionTitle,
}) => {
  const [supportTab, setSupportTab] = useState<'mentor' | 'tickets' | 'faq'>('mentor');

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'mentor',
      text: 'سلام دوست من! من سوپر دوئو (Super Duo)، مربی هوشمند روان‌شناسی تو هستم. 🦉 هر سوالی درباره مفاهیم درسی، مکاتب، تشخیص‌های بالینی، یا رفع اشکال تست‌ها داری بپرس تا با هم حلش کنیم!',
      time: 'هم‌اکنون',
    },
  ]);
  const [inputQuestion, setInputQuestion] = useState<string>('');
  const [isAiReplying, setIsAiReplying] = useState<boolean>(false);

  // New ticket state
  const [newTicketTitle, setNewTicketTitle] = useState<string>('');
  const [newTicketText, setNewTicketText] = useState<string>('');
  const [showNewTicketForm, setShowNewTicketForm] = useState<boolean>(false);

  const quickPrompts = selectedChapterTitle
    ? [
        `نکات کلیدی و تست‌خیز «${selectedChapterTitle}» رو توضیح بده.`,
        `این مفهوم رو با یک مثال کاربردی روزمره بگو.`,
        `یک تست چالشی ارشد از این مبحث بساز.`,
        `چطور این مبحث رو در حافظه بلندمدت بسپارم؟`,
      ]
    : [
        'تفاوت روانکاوی فروید با رفتارگرایی واتسون در چیست؟',
        'مراحل رشد روانی-جنسی فروید را با مثال خلاصه کن.',
        'نوروترانسمیتر دوپامین چه نقشی در اسکیزوفرنی و پارکینسون دارد؟',
        'خطاهای شناختی رایج در درمان شناختی-رفتاری (CBT) کدامند؟',
      ];

  const handleSendMessage = async (textToSend?: string) => {
    const question = textToSend || inputQuestion;
    if (!question.trim()) return;

    playDuoSound('click');
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: question,
      time: 'هم‌اکنون',
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setInputQuestion('');
    setIsAiReplying(true);

    try {
      const res = await fetch('/api/ai/ask-mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          chapterContext: selectedChapterTitle || 'کلیات روان‌شناسی آکادمیک',
        }),
      });

      const data = await res.json().catch(() => ({}));
      const mentorReplyText =
        data.reply ||
        data.fallback ||
        data.error ||
        'پاسخ علمی ثبت شد. برای درک عمیق‌تر پیشنهاد می‌کنیم بخش مربوطه در کتابچه آفلاین را مرور کنید.';

      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now() + 1}`,
          sender: 'mentor',
          text: mentorReplyText,
          time: 'هم‌اکنون',
        },
      ]);
      playDuoSound('correct');
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now() + 1}`,
          sender: 'mentor',
          text: 'دوست خوبم، ارتباط با سرویس آنلاین موقتاً قطع شد، اما طبق اصول روان‌شناسی شناختی، سازمان‌دهی مجدد اطلاعات و بازیابی فعال بهترین راه یادگیری است. مجدداً سوال خود را بپرسید.',
          time: 'هم‌اکنون',
        },
      ]);
    } finally {
      setIsAiReplying(false);
    }
  };

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicketTitle.trim() || !newTicketText.trim()) return;

    playDuoSound('correct');
    const ticket: SupportTicket = {
      id: `t-${Date.now()}`,
      title: newTicketTitle,
      question: newTicketText,
      status: 'pending',
      date: new Date().toLocaleDateString('fa-IR'),
    };

    onAddTicket(ticket);
    setNewTicketTitle('');
    setNewTicketText('');
    setShowNewTicketForm(false);
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-24 select-none animate-fadeIn">
      {/* Super Duo Header Banner */}
      <div className="bg-gradient-to-r from-[#CE82FF] to-[#8035CE] border-b-4 border-[#A557DF] rounded-3xl p-5 sm:p-6 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4 text-right">
          <DuoMascot mood="super" size={56} animate={false} />
          <div>
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full inline-block">
              SUPER DUO AI TUTOR
            </span>
            <h1 className="text-xl sm:text-2xl font-black mt-1">مربی هوش مصنوعی و رفع اشکال</h1>
            <p className="text-[11px] sm:text-xs font-bold opacity-90 mt-0.5">
              پاسخگویی آنی به پرسش‌های علمی با هوش مصنوعی و مربیان روان‌شناسی
            </p>
          </div>
        </div>

        {/* Tab pills */}
        <div className="flex items-center bg-white/20 p-1 rounded-2xl border border-white/30 w-full md:w-auto justify-around overflow-x-auto">
          <button
            onClick={() => {
              playDuoSound('click');
              setSupportTab('mentor');
            }}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex-1 md:flex-initial text-center ${
              supportTab === 'mentor' ? 'bg-white text-[#8035CE] shadow-xs' : 'text-white'
            }`}
          >
            گفتگو با Duo 🦉
          </button>
          <button
            onClick={() => {
              playDuoSound('click');
              setSupportTab('tickets');
            }}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex-1 md:flex-initial text-center ${
              supportTab === 'tickets' ? 'bg-white text-[#8035CE] shadow-xs' : 'text-white'
            }`}
          >
            تیکت‌ها ({tickets.length})
          </button>
          <button
            onClick={() => {
              playDuoSound('click');
              setSupportTab('faq');
            }}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex-1 md:flex-initial text-center ${
              supportTab === 'faq' ? 'bg-white text-[#8035CE] shadow-xs' : 'text-white'
            }`}
          >
            پرسش‌های متداول
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: DUO AI LIVE CHAT                                  */}
      {/* ======================================================== */}
      {supportTab === 'mentor' && (
        <div className="bg-white border-2 border-b-4 border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col gap-4">
          {/* Quick prompt suggestion chips */}
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(prompt)}
                className="bg-purple-50 hover:bg-purple-100 text-[#8035CE] border border-purple-200 rounded-xl px-3 py-1.5 text-xs font-black transition-colors cursor-pointer text-right"
              >
                ⚡ {prompt}
              </button>
            ))}
          </div>

          {/* Chat Messages Log */}
          <div className="flex flex-col gap-3.5 my-2 max-h-[460px] overflow-y-auto p-2">
            {chatMessages.map((msg) => {
              const isDuo = msg.sender === 'mentor';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${
                    isDuo ? 'flex-row' : 'flex-row-reverse'
                  }`}
                >
                  {isDuo ? (
                    <DuoMascot mood="tutor" size={42} animate={false} />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#1CB0F6] text-white flex items-center justify-center font-black text-sm shrink-0">
                      شما
                    </div>
                  )}

                  <div
                    className={`max-w-xl p-4 rounded-2xl text-xs sm:text-sm font-bold leading-relaxed ${
                      isDuo
                        ? 'bg-purple-50/80 border-2 border-purple-200 text-purple-950 text-right'
                        : 'bg-[#1CB0F6] text-white text-right'
                    }`}
                  >
                    <p className="whitespace-pre-line">{msg.text}</p>
                    <span
                      className={`text-[9px] block mt-1.5 ${
                        isDuo ? 'text-purple-400' : 'text-sky-100'
                      }`}
                    >
                      {msg.time}
                    </span>
                  </div>
                </div>
              );
            })}

            {isAiReplying && (
              <div className="flex items-center gap-3">
                <DuoMascot mood="thinking" size={42} animate={false} />
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl text-xs font-black text-purple-700 animate-pulse">
                  Duo در حال نگارش پاسخ علمی و دقیق است...
                </div>
              </div>
            )}
          </div>

          {/* Chat Input Bar */}
          <div className="pt-3 border-t-2 border-slate-100 flex items-center gap-2">
            <input
              type="text"
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="پرسش خود را درباره مکاتب، تشخیص‌ها یا نظریه‌ها بنویسید..."
              className="flex-1 px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-base sm:text-xs font-bold text-slate-800 outline-none focus:border-[#CE82FF] focus:bg-white min-h-[44px]"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputQuestion.trim() || isAiReplying}
              className={`p-3 rounded-2xl cursor-pointer ${
                inputQuestion.trim() && !isAiReplying
                  ? 'duo-btn-purple'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Send className="w-5 h-5 rtl:rotate-180" />
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: TICKETS (رفع اشکال دانشگاهی)                      */}
      {/* ======================================================== */}
      {supportTab === 'tickets' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-600">
              تیکت‌های ارسال شده برای اساتید و هیئت علمی
            </span>
            <button
              onClick={() => setShowNewTicketForm(!showNewTicketForm)}
              className="duo-btn-green px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>ثبت پرسش جدید</span>
            </button>
          </div>

          {showNewTicketForm && (
            <form
              onSubmit={handleCreateTicket}
              className="bg-white border-2 border-b-4 border-slate-200 rounded-3xl p-5 flex flex-col gap-3 shadow-xs animate-fadeIn"
            >
              <h3 className="text-sm font-black text-slate-800">فرم ارسال پرسش به اساتید</h3>
              <input
                type="text"
                value={newTicketTitle}
                onChange={(e) => setNewTicketTitle(e.target.value)}
                placeholder="عنوان پرسش (مثال: ابهام در آزمون اندریافت موضوع TAT)..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#58CC02]"
              />
              <textarea
                value={newTicketText}
                onChange={(e) => setNewTicketText(e.target.value)}
                placeholder="شرح کامل پرسش یا تست مورد نظر..."
                className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#58CC02] resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewTicketForm(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="duo-btn-green px-4 py-2 rounded-xl text-xs font-black cursor-pointer"
                >
                  ارسال تیکت
                </button>
              </div>
            </form>
          )}

          {tickets.map((t) => (
            <div
              key={t.id}
              className="bg-white border-2 border-b-4 border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black text-slate-800">{t.title}</h4>
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                    t.status === 'answered'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {t.status === 'answered' ? 'پاسخ داده شده' : 'در حال بررسی توسط استاد'}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-600">{t.question}</p>
              {t.reply && (
                <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-800">
                  <span className="text-[10px] font-black text-[#58CC02] block mb-1">
                    پاسخ هیئت علمی:
                  </span>
                  <p>{t.reply}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: FAQ (پرسش‌های پرتکرار)                              */}
      {/* ======================================================== */}
      {supportTab === 'faq' && (
        <div className="flex flex-col gap-3">
          {[
            {
              q: 'آیا پیشرفت و زنجیره مطالعه من ذخیره می‌شود؟',
              a: 'بله! تمام پاسخ‌ها، امتیازهای XP، زنجیره مطالعه و یادداشت‌های شما به صورت خودکار در حافظه مرورگر نگهداری می‌شوند و حتی بدون اینترنت هم فعال هستند.',
            },
            {
              q: 'چگونه به لیگ‌های بالاتر صعود کنم؟',
              a: 'با حل کوئیزها، مطالعه کامل فصول و کسب امتیازهای تجربه (XP) در طول هفته می‌توانید به رده‌های بالاتر لیگ الماس صعود کنید.',
            },
            {
              q: 'آیا می‌توانم روی سیستم صوتی مرورگر متون را بشنوم؟',
              a: 'بله! در بخش کتابچه راهنما، با فشردن دکمه «گوش دادن» سیستم صوتی فارسی مرورگر کل متن یا مبحث انتخابی را برای شما می‌خواند.',
            },
          ].map((faq, i) => (
            <div
              key={i}
              className="bg-white border-2 border-b-4 border-slate-200 rounded-2xl p-4 shadow-xs text-right"
            >
              <h4 className="text-xs font-black text-slate-800 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[#1CB0F6]" />
                <span>{faq.q}</span>
              </h4>
              <p className="text-xs font-bold text-slate-600 mt-2 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
