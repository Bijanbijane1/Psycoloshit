import React, { useState, useRef, useEffect } from 'react';
import { SupportTicket } from '../types/psychology';
import {
  Send,
  Sparkles,
  HelpCircle,
  PlusCircle,
  GraduationCap,
} from 'lucide-react';
import { playDuoSound } from '../utils/duoAudio';
import { streamMentorResponse, requestMentorResponse } from '../services/aiClient';
import { toPersianDigits } from '../utils/persianDigits';

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
      text: 'سلام پژوهشگر گرامی! من استاد راهنمای هوشمند روان‌مستر هستم. هر پرسشی درباره مفاهیم درسی، مکاتب روان‌شناسی، تشخیص‌های بالینی، یا تحلیل گزینه‌های کنکور دارید بپرسید تا با هم بررسی کنیم.',
      time: 'هم‌اکنون',
    },
  ]);
  const [inputQuestion, setInputQuestion] = useState<string>('');
  const [isAiReplying, setIsAiReplying] = useState<boolean>(false);
  const streamAbortControllerRef = useRef<AbortController | null>(null);

  // Abort any in-flight SSE stream on unmount (Task 1D)
  useEffect(() => {
    return () => {
      if (streamAbortControllerRef.current) {
        streamAbortControllerRef.current.abort();
      }
    };
  }, []);

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

    // Abort any previous in-flight SSE stream before starting a new one
    if (streamAbortControllerRef.current) {
      streamAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    streamAbortControllerRef.current = abortController;

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

    const mentorMsgId = `msg-${Date.now() + 1}`;
    setChatMessages((prev) => [
      ...prev,
      {
        id: mentorMsgId,
        sender: 'mentor',
        text: 'در حال نگارش پاسخ تخصصی...',
        time: 'هم‌اکنون',
      },
    ]);

    await streamMentorResponse(
      {
        question,
        chapterContext: selectedSectionTitle || selectedChapterTitle || 'کلیات روان‌شناسی آکادمیک',
        chapterTitle: selectedChapterTitle || 'کلیات روان‌شناسی',
      },
      {
        signal: abortController.signal,
        onChunk: (_delta, fullText) => {
          setChatMessages((prev) =>
            prev.map((msg) => (msg.id === mentorMsgId ? { ...msg, text: fullText } : msg))
          );
        },
        onComplete: (fullText) => {
          if (fullText) {
            setChatMessages((prev) =>
              prev.map((msg) => (msg.id === mentorMsgId ? { ...msg, text: fullText } : msg))
            );
          }
          playDuoSound('correct');
          setIsAiReplying(false);
        },
        onError: async (errMsg) => {
          if (abortController.signal.aborted) return;
          const fallbackRes = await requestMentorResponse({
            question,
            chapterContext: selectedSectionTitle || selectedChapterTitle || 'کلیات روان‌شناسی آکادمیک',
            chapterTitle: selectedChapterTitle || 'کلیات روان‌شناسی',
          });
          setChatMessages((prev) =>
            prev.map((msg) =>
              msg.id === mentorMsgId
                ? { ...msg, text: fallbackRes.text || errMsg }
                : msg
            )
          );
          setIsAiReplying(false);
        },
      }
    );
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
    <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-28 select-none animate-fadeIn">
      {/* Editorial Academic Mentor Header Banner */}
      <div className="bg-[#36345F] border border-[#4A477A] rounded-3xl p-5 sm:p-6 text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 sm:gap-4 text-right">
          <div className="w-14 h-14 rounded-2xl bg-[#EAE4FF]/15 border border-[#EAE4FF]/25 flex items-center justify-center text-[#EAE4FF] shrink-0">
            <GraduationCap className="w-7 h-7" />
          </div>
          <div>
            <span className="text-[10px] sm:text-[11px] font-extrabold tracking-wider bg-[#7056D8]/45 border border-[#EAE4FF]/25 px-2.5 py-0.5 rounded-full inline-block text-[#EAE4FF]">
              استودیو مشاوره و رفع اشکال علمی
            </span>
            <h1 className="text-xl sm:text-2xl font-black mt-1 text-white">استاد راهنما و منتور هوشمند</h1>
            <p className="text-[11px] sm:text-xs font-medium text-[#EAE4FF]/85 mt-0.5">
              پاسخگویی تحلیلی به پرسش‌های مفهومی، بالینی و تستی روان‌شناسی
            </p>
          </div>
        </div>

        {/* Tab pills */}
        <div className="flex items-center bg-white/10 p-1 rounded-2xl border border-white/20 w-full md:w-auto justify-around overflow-x-auto gap-1">
          <button
            onClick={() => {
              playDuoSound('click');
              setSupportTab('mentor');
            }}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex-1 md:flex-initial text-center whitespace-nowrap ${
              supportTab === 'mentor' ? 'bg-white text-[#36345F] shadow-2xs' : 'text-white/90 hover:text-white'
            }`}
          >
            گفتگو با استاد راهنما
          </button>
          <button
            onClick={() => {
              playDuoSound('click');
              setSupportTab('tickets');
            }}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex-1 md:flex-initial text-center whitespace-nowrap ${
              supportTab === 'tickets' ? 'bg-white text-[#36345F] shadow-2xs' : 'text-white/90 hover:text-white'
            }`}
          >
            تیکت‌ها ({toPersianDigits(tickets.length)})
          </button>
          <button
            onClick={() => {
              playDuoSound('click');
              setSupportTab('faq');
            }}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex-1 md:flex-initial text-center whitespace-nowrap ${
              supportTab === 'faq' ? 'bg-white text-[#36345F] shadow-2xs' : 'text-white/90 hover:text-white'
            }`}
          >
            پرسش‌های متداول
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: ACADEMIC AI MENTOR LIVE CHAT                      */}
      {/* ======================================================== */}
      {supportTab === 'mentor' && (
        <div className="bg-white border border-[#E5E1EB] rounded-3xl p-4 sm:p-6 shadow-2xs flex flex-col gap-4">
          {/* Quick prompt suggestion chips */}
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(prompt)}
                className="min-h-[44px] bg-[#F7F5F0] hover:bg-[#EAE4FF]/60 text-[#36345F] border border-[#E5E1EB] hover:border-[#7056D8]/40 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer text-right flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#7056D8] shrink-0" />
                <span>{prompt}</span>
              </button>
            ))}
          </div>

          {/* Chat Messages Log */}
          <div className="flex flex-col gap-3.5 my-2 max-h-[460px] overflow-y-auto touch-scroll p-1 sm:p-2">
            {chatMessages.map((msg) => {
              const isMentor = msg.sender === 'mentor';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 sm:gap-3 ${
                    isMentor ? 'flex-row' : 'flex-row-reverse'
                  }`}
                >
                  {isMentor ? (
                    <div className="w-10 h-10 rounded-2xl bg-[#EAE4FF] border border-[#7056D8]/25 text-[#7056D8] flex items-center justify-center shrink-0">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-2xl bg-[#36345F] text-white flex items-center justify-center font-extrabold text-xs shrink-0">
                      شما
                    </div>
                  )}

                  <div
                    className={`max-w-xl p-4 rounded-2xl text-xs sm:text-sm font-bold leading-relaxed ${
                      isMentor
                        ? 'bg-[#F7F5F0] border border-[#E5E1EB] text-[#24243B] text-right'
                        : 'bg-[#7056D8] text-white text-right'
                    }`}
                  >
                    <p className="whitespace-pre-line">{msg.text}</p>
                    <span
                      className={`text-[10px] block mt-1.5 ${
                        isMentor ? 'text-[#69697E]' : 'text-[#EAE4FF]'
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
                <div className="w-10 h-10 rounded-2xl bg-[#EAE4FF] border border-[#7056D8]/25 text-[#7056D8] flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div className="p-3 bg-[#EAE4FF]/50 border border-[#7056D8]/25 rounded-2xl text-xs font-extrabold text-[#36345F] animate-pulse">
                  استاد راهنما در حال تدوین پاسخ علمی و تحلیلی است...
                </div>
              </div>
            )}
          </div>

          {/* Chat Input Bar */}
          <div className="pt-3 border-t border-[#E5E1EB] flex items-center gap-2">
            <input
              type="text"
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="پرسش خود را درباره مکاتب، تشخیص‌ها یا نظریه‌ها بنویسید..."
              className="flex-1 px-4 py-3 bg-[#F7F5F0] border border-[#E5E1EB] rounded-2xl text-base lg:text-xs font-bold text-[#24243B] outline-none focus:border-[#7056D8] focus:bg-white min-h-[48px]"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputQuestion.trim() || isAiReplying}
              aria-label="ارسال پرسش"
              className={`min-w-[48px] min-h-[48px] p-3 rounded-2xl flex items-center justify-center transition-colors ${
                inputQuestion.trim() && !isAiReplying
                  ? 'editorial-btn-primary cursor-pointer'
                  : 'bg-[#E5E1EB] text-[#69697E] cursor-not-allowed'
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-extrabold text-[#69697E]">
              تیکت‌های ارسال شده برای اساتید و هیئت علمی ({toPersianDigits(tickets.length)} مورد)
            </span>
            <button
              onClick={() => setShowNewTicketForm(!showNewTicketForm)}
              className="editorial-btn-leaf min-h-[44px] px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>ثبت پرسش جدید</span>
            </button>
          </div>

          {showNewTicketForm && (
            <form
              onSubmit={handleCreateTicket}
              className="bg-white border border-[#E5E1EB] rounded-3xl p-5 flex flex-col gap-3 shadow-2xs animate-fadeIn"
            >
              <h3 className="text-sm font-black text-[#24243B]">فرم ارسال پرسش به اساتید</h3>
              <input
                type="text"
                value={newTicketTitle}
                onChange={(e) => setNewTicketTitle(e.target.value)}
                placeholder="عنوان پرسش (مثال: ابهام در آزمون اندریافت موضوع TAT)..."
                className="w-full px-3.5 py-2.5 bg-[#F7F5F0] border border-[#E5E1EB] rounded-xl text-base lg:text-xs font-bold text-[#24243B] outline-none focus:border-[#7056D8] focus:bg-white min-h-[44px]"
              />
              <textarea
                value={newTicketText}
                onChange={(e) => setNewTicketText(e.target.value)}
                placeholder="شرح کامل پرسش یا تست مورد نظر..."
                className="w-full h-24 p-3.5 bg-[#F7F5F0] border border-[#E5E1EB] rounded-xl text-base lg:text-xs font-bold text-[#24243B] outline-none focus:border-[#7056D8] focus:bg-white resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewTicketForm(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-[#69697E] hover:text-[#24243B] hover:bg-[#F7F5F0] cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="editorial-btn-primary min-h-[44px] px-4 py-2 rounded-xl text-xs font-extrabold cursor-pointer"
                >
                  ارسال تیکت
                </button>
              </div>
            </form>
          )}

          {tickets.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-[#E5E1EB] rounded-3xl p-5 shadow-2xs flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-sm font-black text-[#24243B]">{t.title}</h4>
                <span
                  className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                    t.status === 'answered'
                      ? 'bg-[#DDF3E9] text-[#134E4A] border-[#149D9A]/30'
                      : 'bg-[#FFF0C8] text-[#5C3D0E] border-[#E5A33D]/40'
                  }`}
                >
                  {t.status === 'answered' ? 'پاسخ داده شده' : 'در حال بررسی توسط استاد'}
                </span>
              </div>
              <p className="text-xs font-bold text-[#69697E] leading-relaxed">{t.question}</p>
              {t.reply && (
                <div className="mt-2 p-3.5 bg-[#F7F5F0] rounded-2xl border border-[#E5E1EB] text-xs font-bold text-[#24243B] leading-relaxed">
                  <span className="text-[11px] font-extrabold text-[#149D9A] block mb-1">
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
              a: 'بله! در بخش کتابچه راهنما، با فشردن دکمه «خوانش صوتی» سیستم صوتی فارسی مرورگر کل متن یا مبحث انتخابی را برای شما می‌خواند.',
            },
          ].map((faq, i) => (
            <div
              key={i}
              className="bg-white border border-[#E5E1EB] rounded-2xl p-4 sm:p-5 shadow-2xs text-right"
            >
              <h4 className="text-xs sm:text-sm font-black text-[#24243B] flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[#7056D8] shrink-0" />
                <span>{faq.q}</span>
              </h4>
              <p className="text-xs font-bold text-[#69697E] mt-2 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

