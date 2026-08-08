import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ClipboardDocumentIcon, TruckIcon } from '@heroicons/react/24/outline';
import useAuthStore from '../store/authStore';
import useChatStore from '../store/chatStore';
import { fetchOrder } from '../services/api';
import { getSocket } from '../services/socket';
import {
  avatarColor,
  formatTime,
  getInitials,
  relativeTimeBn,
  roomId as getRoomId,
} from '../utils/helpers';

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3 bg-slate-200 rounded w-3/4" />
      <div className="h-3 bg-slate-200 rounded w-1/2" />
      <div className="h-3 bg-slate-200 rounded w-2/3" />
    </div>
  );
}

export default function CustomerContext() {
  const agent = useAuthStore((s) => s.agent);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const rooms = useChatStore((s) => s.rooms);
  const onlineAgents = useChatStore((s) => s.onlineAgents);
  const addOrUpdateRoom = useChatStore((s) => s.addOrUpdateRoom);
  const persistTag = useChatStore((s) => s.persistTag);
  const setActiveRoom = useChatStore((s) => s.setActiveRoom);
  const setMessages = useChatStore((s) => s.setMessages);

  const activeRoom = useChatStore((s) => s.activeRoom);
  const room = useMemo(
    () =>
      activeRoom ||
      rooms.find((r) => getRoomId(r) === activeRoomId) ||
      null,
    [activeRoom, rooms, activeRoomId]
  );

  const [order, setOrder] = useState(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState(null);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [showTag, setShowTag] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);

  useEffect(() => {
    setOrder(null);
    setOrderError(null);
    setShowNote(false);
    setShowTag(false);
    setShowTransfer(false);
    setNote('');
    setTagInput('');

    if (!room?.order_id || room.type !== 'ORDER_SUPPORT') return;

    // Prefer snapshot attached at chat start so agents see context instantly.
    const snap = room.order_metadata;
    if (snap && (snap.order_number || snap.items?.length || snap.total_amount != null)) {
      setOrder({
        orderId: snap.order_number,
        order_number: snap.order_number,
        items: snap.items || [],
        grandTotal: snap.total_amount,
        total: snap.total_amount,
        status: snap.status,
        fromSnapshot: true,
      });
      setOrderLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setOrderLoading(true);
      try {
        const data = await fetchOrder(room.order_id);
        if (!cancelled) setOrder(data?.order || data?.data || data);
      } catch (err) {
        if (!cancelled) {
          setOrderError(err.response?.data?.message || 'অর্ডার পাওয়া যায়নি');
        }
      } finally {
        if (!cancelled) setOrderLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [room?._id, room?.order_id, room?.type, room?.order_metadata]);

  const previousChats = useMemo(() => {
    if (!room) return [];
    const session = room.guest_session_id;
    const email = room.guest_email;
    return rooms
      .filter((r) => {
        const id = getRoomId(r);
        if (id === activeRoomId) return false;
        if (r.status !== 'RESOLVED') return false;
        if (session && r.guest_session_id === session) return true;
        if (email && r.guest_email === email) return true;
        return false;
      })
      .sort(
        (a, b) =>
          new Date(b.resolved_at || b.updatedAt || 0) -
          new Date(a.resolved_at || a.updatedAt || 0)
      )
      .slice(0, 3);
  }, [rooms, room, activeRoomId]);

  if (!room) {
    return (
      <aside className="h-full bg-white border-l border-slate-200 flex items-center justify-center">
        <p className="text-sm text-slate-400 px-6 text-center">
          কাস্টমার তথ্য দেখতে একটি চ্যাট সিলেক্ট করুন
        </p>
      </aside>
    );
  }

  const displayOrderId =
    room.order_metadata?.order_number ||
    order?.orderId ||
    order?.order_number ||
    room.order_id;

  const copyOrderId = async () => {
    try {
      await navigator.clipboard.writeText(String(displayOrderId));
      toast.success('অর্ডার আইডি কপি হয়েছে');
    } catch {
      toast.error('কপি করা যায়নি');
    }
  };

  const addInternalNote = () => {
    const text = note.trim();
    if (!text) return;
    const socket = getSocket();
    if (socket?.connected) {
      // INTERNAL notes — never leak to customer widget
      socket.emit('internal_note', {
        room_id: activeRoomId,
        message: text,
      });
    }
    toast.success('ইন্টারনাল নোট যোগ করা হয়েছে');
    setNote('');
    setShowNote(false);
  };

  const addTag = async () => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    try {
      await persistTag(activeRoomId, tag);
      toast.success(`ট্যাগ যোগ: ${tag}`);
      setTagInput('');
      setShowTag(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'ট্যাগ সেভ হয়নি');
    }
  };

  const transferTo = (targetAgent) => {
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('transfer_chat', {
        room_id: activeRoomId,
        target_agent_id: targetAgent.agent_id || targetAgent.id,
      });
    }
    toast.success(`${targetAgent.name}-এ ট্রান্সফার রিকোয়েস্ট পাঠানো হয়েছে`);
    setShowTransfer(false);
  };

  const paymentStatus = order?.payment_status || order?.paymentStatus || order?.payment?.status;
  const orderTotal =
    order?.grandTotal ?? order?.total_amount ?? order?.price ?? order?.total ?? null;
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const trackingUrl =
    order?.tracking_url ||
    order?.trackingUrl ||
    (order?.tracking_id
      ? `https://www.google.com/search?q=${encodeURIComponent(order.tracking_id)}`
      : null);

  return (
    <aside className="h-full bg-white border-l border-slate-200 overflow-y-auto custom-scroll">
      <div className="p-4 space-y-5">
        {/* Customer Info */}
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
            কাস্টমার তথ্য
          </h4>
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-full ${avatarColor(
                room.guest_name
              )} flex items-center justify-center text-white font-semibold`}
            >
              {getInitials(room.guest_name || 'G')}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">
                {room.guest_name || 'Guest'}
              </p>
              {room.guest_email && (
                <p className="text-xs text-slate-500 truncate">{room.guest_email}</p>
              )}
              <span
                className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  room.user_id
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {room.user_id ? 'Registered' : 'Guest'}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            সেশন শুরু: {relativeTimeBn(room.createdAt)} (
            {formatTime(room.createdAt)})
          </p>
          {room.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {room.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Order Info */}
        {room.type === 'ORDER_SUPPORT' && room.order_id && (
          <section className="rounded-xl border border-slate-100 shadow-sm p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
              অর্ডার তথ্য
            </h4>
            <div className="flex items-center gap-2 mb-3">
              <code className="text-xs bg-slate-50 px-2 py-1 rounded flex-1 truncate">
                #{displayOrderId}
              </code>
              <button
                type="button"
                onClick={copyOrderId}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition"
                title="কপি"
              >
                <ClipboardDocumentIcon className="w-4 h-4" />
              </button>
            </div>

            {orderLoading && <Skeleton />}
            {orderError && !order && (
              <p className="text-xs text-slate-400">{orderError}</p>
            )}
            {order && !orderLoading && (
              <div className="space-y-2 text-sm">
                {orderItems.length > 0 ? (
                  <ul className="space-y-1.5">
                    {orderItems.slice(0, 5).map((item, idx) => (
                      <li
                        key={`${item.name || 'item'}-${idx}`}
                        className="flex items-start justify-between gap-2 text-slate-700"
                      >
                        <span className="min-w-0 truncate">
                          {item.name || item.productName || 'অর্ডার আইটেম'}
                          {(item.quantity || item.qty) > 1 && (
                            <span className="text-slate-400"> ×{item.quantity || item.qty}</span>
                          )}
                        </span>
                        {item.price != null && (
                          <span className="shrink-0 text-slate-500">
                            ৳{Number(item.price).toLocaleString()}
                          </span>
                        )}
                      </li>
                    ))}
                    {orderItems.length > 5 && (
                      <li className="text-xs text-slate-400">
                        +{orderItems.length - 5} more item
                        {orderItems.length - 5 > 1 ? 's' : ''}
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="font-medium text-slate-800">
                    {order.product_name ||
                      order.productName ||
                      'অর্ডার আইটেম'}
                  </p>
                )}
                {orderTotal != null && (
                  <p className="font-semibold text-slate-800">
                    Total: ৳{Number(orderTotal).toLocaleString()}
                  </p>
                )}
                {(order.status || paymentStatus) && (
                  <div className="flex flex-wrap gap-1">
                    {order.status && (
                      <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">
                        {order.status}
                      </span>
                    )}
                    {paymentStatus && (
                      <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        {paymentStatus}
                      </span>
                    )}
                  </div>
                )}
                {(order.delivery_address ||
                  order.shipping_address ||
                  order.customerAddress) && (
                  <p className="text-xs text-slate-500">
                    {order.delivery_address ||
                      order.customerAddress ||
                      order.shipping_address?.full ||
                      JSON.stringify(order.shipping_address)}
                  </p>
                )}
                {(order.order_date || order.createdAt) && !order.fromSnapshot && (
                  <p className="text-xs text-slate-400">
                    অর্ডার তারিখ: {relativeTimeBn(order.order_date || order.createdAt)}
                  </p>
                )}
                {trackingUrl && (
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 mt-1 text-sm font-medium text-primary hover:underline"
                  >
                    <TruckIcon className="w-4 h-4" />
                    ট্র্যাক করুন 🚚
                  </a>
                )}
              </div>
            )}
          </section>
        )}

        {/* Previous Chats */}
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
            পূর্ববর্তী চ্যাট
          </h4>
          {previousChats.length === 0 ? (
            <p className="text-xs text-slate-400">কোনো পূর্ববর্তী চ্যাট নেই</p>
          ) : (
            <ul className="space-y-2">
              {previousChats.map((chat) => (
                <li key={getRoomId(chat)}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRoom(getRoomId(chat), chat);
                      setMessages(getRoomId(chat), []);
                      window.open(
                        `/dashboard?room=${getRoomId(chat)}`,
                        '_blank',
                        'noopener'
                      );
                    }}
                    className="w-full text-left rounded-xl border border-slate-100 px-3 py-2 hover:bg-slate-50 transition"
                  >
                    <p className="text-xs font-medium text-slate-700 truncate">
                      {chat.last_message || 'সমাধানকৃত চ্যাট'}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {relativeTimeBn(chat.resolved_at || chat.updatedAt)}
                      {chat.rating ? ` · ⭐ ${chat.rating}` : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Quick Actions */}
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
            কুইক অ্যাকশন
          </h4>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowNote((v) => !v)}
              className="w-full text-left rounded-xl border border-slate-200 px-3 py-2.5 text-sm hover:bg-slate-50 transition"
            >
              📋 নোট যোগ করুন
            </button>
            {showNote && (
              <div className="space-y-2">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="ইন্টারনাল নোট…"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={addInternalNote}
                  className="w-full rounded-xl bg-primary text-white text-sm py-2 font-medium"
                >
                  সেভ নোট
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowTag((v) => !v)}
              className="w-full text-left rounded-xl border border-slate-200 px-3 py-2.5 text-sm hover:bg-slate-50 transition"
            >
              🏷️ ট্যাগ করুন
            </button>
            {showTag && (
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="refund, defective…"
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary"
                  list="tag-suggestions"
                />
                <datalist id="tag-suggestions">
                  <option value="refund" />
                  <option value="defective" />
                  <option value="shipping" />
                  <option value="payment" />
                </datalist>
                <button
                  type="button"
                  onClick={addTag}
                  className="rounded-xl bg-slate-800 text-white px-3 text-sm"
                >
                  Add
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowTransfer((v) => !v)}
              className="w-full text-left rounded-xl border border-slate-200 px-3 py-2.5 text-sm hover:bg-slate-50 transition"
            >
              ↗️ অন্য এজেন্টে পাঠান
            </button>
            {showTransfer && (
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                {onlineAgents.filter(
                  (a) =>
                    String(a.agent_id || a.id) !==
                    String(agent?.id || agent?._id)
                ).length === 0 ? (
                  <p className="text-xs text-slate-400 px-3 py-2">
                    অন্য কোনো অনলাইন এজেন্ট নেই
                  </p>
                ) : (
                  onlineAgents
                    .filter(
                      (a) =>
                        String(a.agent_id || a.id) !==
                        String(agent?.id || agent?._id)
                    )
                    .map((a) => (
                      <button
                        key={a.agent_id || a.id}
                        type="button"
                        onClick={() => transferTo(a)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0"
                      >
                        {a.name}
                      </button>
                    ))
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
