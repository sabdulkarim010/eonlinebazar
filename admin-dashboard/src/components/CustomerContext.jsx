import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ClipboardDocumentIcon, TruckIcon, ShoppingBagIcon } from '@heroicons/react/24/outline';
import useChatStore from '../store/chatStore';
import { fetchOrder, fetchRoomDetail, fetchCustomerOrders, fetchCustomerProfile } from '../services/api';
import { getSocket } from '../services/socket';
import TransferModal from './TransferModal';
import TagModal, { tagChipClass } from './TagModal';
import {
  formatTime,
  relativeTimeBn,
  resolveAssetUrl,
  roomId as getRoomId,
  resolveRoomUserId,
  pickCustomerAvatar,
} from '../utils/helpers';

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="skeleton h-3 w-3/4" />
      <div className="skeleton h-3 w-1/2" />
      <div className="skeleton h-3 w-2/3" />
    </div>
  );
}

export default function CustomerContext({
  onTransfer,
  onNote,
  onTag,
}) {
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const rooms = useChatStore((s) => s.rooms);
  const typingRooms = useChatStore((s) => s.typingRooms);
  const setActiveRoom = useChatStore((s) => s.setActiveRoom);
  const setMessages = useChatStore((s) => s.setMessages);
  const addOrUpdateRoom = useChatStore((s) => s.addOrUpdateRoom);
  const clearUnread = useChatStore((s) => s.clearUnread);

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
  const [storeOrders, setStoreOrders] = useState([]);
  const [storeOrdersLoading, setStoreOrdersLoading] = useState(false);
  const [storeOrdersError, setStoreOrdersError] = useState(null);
  const [liveProfile, setLiveProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showTag, setShowTag] = useState(false);

  const typingInfo = typingRooms[activeRoomId];

  useEffect(() => {
    setOrder(null);
    setOrderError(null);
    setStoreOrders([]);
    setStoreOrdersError(null);
    setLiveProfile(null);
    setProfileError(null);
    setAvatarFailed(false);
    setShowTransfer(false);
    setShowTag(false);

    if (!room?.order_id || room.type !== 'ORDER_SUPPORT') return undefined;

    const snap = room.order_metadata;
    if (
      snap &&
      (snap.order_number || snap.items?.length || snap.total_amount != null)
    ) {
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
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setOrderLoading(true);
      try {
        const data = await fetchOrder(room.order_id);
        if (!cancelled) setOrder(data?.order || data?.data || data);
      } catch (err) {
        if (!cancelled) {
          setOrderError(err.response?.data?.message || 'Order not found');
        }
      } finally {
        if (!cancelled) setOrderLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [room?._id, room?.order_id, room?.type, room?.order_metadata]);

  useEffect(() => {
    setLiveProfile(null);
    setProfileError(null);
    setAvatarFailed(false);

    const userId = resolveRoomUserId(room);
    if (!userId) return undefined;

    let cancelled = false;
    (async () => {
      setProfileLoading(true);
      try {
        const data = await fetchCustomerProfile(userId, { fresh: true });
        if (!cancelled) {
          setLiveProfile(data?.profile || data?.data || null);
        }
      } catch (err) {
        if (!cancelled) {
          setProfileError(
            err.response?.data?.message || 'Could not load customer profile'
          );
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [room?._id, room?.user_id, room?.customer_profile?.user_id]);

  useEffect(() => {
    setStoreOrders([]);
    setStoreOrdersError(null);

    const userId = resolveRoomUserId(room);
    if (!userId) return undefined;

    let cancelled = false;
    (async () => {
      setStoreOrdersLoading(true);
      try {
        const data = await fetchCustomerOrders(userId, 20);
        if (!cancelled) {
          setStoreOrders(Array.isArray(data?.orders) ? data.orders : data?.data || []);
        }
      } catch (err) {
        if (!cancelled) {
          setStoreOrdersError(
            err.response?.data?.message || 'Could not load order history'
          );
        }
      } finally {
        if (!cancelled) setStoreOrdersLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [room?._id, room?.user_id, room?.customer_profile?.user_id]);

  useEffect(() => {
    setAvatarFailed(false);
  }, [
    activeRoomId,
    liveProfile?.avatarUrl,
    liveProfile?.avatar,
    liveProfile?.image,
    liveProfile?.profilePic,
    room?.customer_profile?.avatarUrl,
    room?.customer_profile?.avatar,
    room?.customer?.avatarUrl,
    room?.customer?.avatar,
    room?.user_id?.avatarUrl,
    room?.user_id?.avatar,
  ]);

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
      <aside className="h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex items-center justify-center">
        <p className="text-sm text-text-secondary px-6 text-center leading-bn">
          Select a chat to view customer details
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
      toast.success('Order ID copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const openPrevious = async (chat) => {
    const id = getRoomId(chat);
    setActiveRoom(id, chat);
    clearUnread(id);
    const socket = getSocket();
    if (socket?.connected) socket.emit('join_room', { room_id: id });
    try {
      const data = await fetchRoomDetail(id);
      if (data.room) {
        setActiveRoom(id, data.room);
        addOrUpdateRoom(data.room);
      }
      setMessages(id, data.messages || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load chat');
    }
  };

  const paymentStatus =
    order?.payment_status || order?.paymentStatus || order?.payment?.status;
  const orderTotal =
    order?.grandTotal ?? order?.total_amount ?? order?.price ?? order?.total ?? null;
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const trackingUrl =
    order?.tracking_url ||
    order?.trackingUrl ||
    (order?.tracking_id
      ? `https://www.google.com/search?q=${encodeURIComponent(order.tracking_id)}`
      : null);

  const profile = {
    ...(room.customer_profile || {}),
    ...(liveProfile || {}),
  };
  const customer = {
    ...(room.customer || {}),
    ...profile,
    user: room.user || profile.user || null,
  };
  const userId =
    resolveRoomUserId(room) || profile.user_id || liveProfile?.user_id;
  const isRegistered = Boolean(
    room.is_registered || userId || profile.user_id
  );
  const displayName =
    profile.name ||
    room.guest_name ||
    (isRegistered ? 'Customer' : 'Guest');
  const displayEmail = profile.email || room.guest_email || null;
  const displayPhone = profile.mobile || profile.phone || null;
  const displayAddress =
    profile.defaultAddress?.formatted ||
    profile.defaultAddress?.fullAddress ||
    null;
  const rawAvatar = pickCustomerAvatar(customer, {
    ...room,
    customer_profile: profile,
    customer,
  });
  const avatarSrc =
    profile?.avatar ||
    profile?.avatarUrl ||
    room?.customer_profile?.avatar ||
    room?.customer_profile?.avatarUrl ||
    rawAvatar ||
    null;
  const avatarUrl =
    !avatarFailed && avatarSrc ? resolveAssetUrl(avatarSrc) : null;
  const productMeta = room.product_metadata || null;

  return (
    <aside className="h-full w-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 overflow-y-auto custom-scroll">
      <div className="p-4 space-y-5">
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">
            Customer details
          </h4>
          {profileLoading && <Skeleton />}
          {profileError && !liveProfile && (
            <p className="text-xs text-amber-600 mb-2">{profileError}</p>
          )}
          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="relative flex-shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-14 h-14 rounded-full object-cover ring-2 ring-orange-400"
                  onError={() => setAvatarFailed(true)}
                />
              ) : null}
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl ring-2 ring-orange-400"
                style={{
                  display: avatarUrl ? 'none' : 'flex',
                  background: 'linear-gradient(135deg, #f97316, #ea580c)',
                }}
              >
                {displayName?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full ring-2 ring-white dark:ring-slate-800" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800 dark:text-white text-sm truncate">
                {displayName || 'Customer'}
              </p>
              {displayEmail && (
                <p className="text-slate-500 dark:text-slate-400 text-xs truncate">
                  {displayEmail}
                </p>
              )}
              {displayPhone && (
                <p className="text-slate-500 dark:text-slate-400 text-xs truncate">
                  {displayPhone}
                </p>
              )}
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                {profile?.isVerified || isRegistered ? 'Verified' : 'Registered'}
              </span>
            </div>
          </div>
          {displayAddress && (
            <p className="text-xs text-text-secondary mt-3 leading-bn">
              <span className="font-medium text-slate-600 dark:text-slate-300">
                Shipping:{' '}
              </span>
              {displayAddress}
            </p>
          )}
          <p className="text-xs text-text-secondary mt-3 leading-bn">
            Session: {relativeTimeBn(room.createdAt)} ({formatTime(room.createdAt)})
          </p>
          {typingInfo && (
            <p className="text-xs text-primary mt-1 animate-pulse">
              {typingInfo.name || 'Customer'} is typing…
            </p>
          )}
          {room.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {room.tags.map((t) => (
                <span
                  key={t}
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${tagChipClass(t)}`}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </section>

        {productMeta && (productMeta.title || productMeta.product_id) && (
          <section className="rounded-card border border-violet-100 dark:border-violet-900 shadow-soft p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">
              Product context
            </h4>
            <div className="flex gap-3">
              {productMeta.image && (
                <img
                  src={productMeta.image}
                  alt={productMeta.title || 'Product'}
                  className="w-14 h-14 rounded-lg object-cover border border-slate-100 dark:border-slate-800 shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary dark:text-white line-clamp-2">
                  {productMeta.title || 'Product'}
                </p>
                {productMeta.price != null && (
                  <p className="text-xs text-text-secondary mt-0.5">
                    BDT {Number(productMeta.price).toLocaleString()}
                  </p>
                )}
                {productMeta.url && (
                  <a
                    href={productMeta.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <ShoppingBagIcon className="w-3.5 h-3.5" />
                    View product
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        {room.type === 'ORDER_SUPPORT' && room.order_id && (
          <section className="rounded-card border border-slate-100 dark:border-slate-800 shadow-soft p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">
              Order details
            </h4>
            <div className="flex items-center gap-2 mb-3">
              <code className="text-xs bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded flex-1 truncate">
                #{displayOrderId}
              </code>
              <button
                type="button"
                onClick={copyOrderId}
                className="p-1.5 rounded-btn hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"
                title="Copy"
              >
                <ClipboardDocumentIcon className="w-4 h-4" />
              </button>
            </div>

            {orderLoading && <Skeleton />}
            {orderError && !order && (
              <p className="text-xs text-text-secondary">{orderError}</p>
            )}
            {order && !orderLoading && (
              <div className="space-y-2 text-sm">
                {orderItems.length > 0 ? (
                  <ul className="space-y-1.5">
                    {orderItems.slice(0, 5).map((item, idx) => (
                      <li
                        key={`${item.name || 'item'}-${idx}`}
                        className="flex items-start justify-between gap-2 text-slate-700 dark:text-slate-200"
                      >
                        <span className="min-w-0 truncate">
                          {item.name || item.productName || 'Order item'}
                          {(item.quantity || item.qty) > 1 && (
                            <span className="text-slate-400">
                              {' '}
                              ×{item.quantity || item.qty}
                            </span>
                          )}
                        </span>
                        {item.price != null && (
                          <span className="shrink-0 text-slate-500">
                            BDT {Number(item.price).toLocaleString()}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-medium text-text-primary dark:text-white">
                    {order.product_name ||
                      order.productName ||
                      'Order item'}
                  </p>
                )}
                {orderTotal != null && (
                  <p className="font-semibold text-text-primary dark:text-white">
                    Total: BDT {Number(orderTotal).toLocaleString()}
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
                {trackingUrl && (
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 mt-1 text-sm font-medium text-primary hover:underline"
                  >
                    <TruckIcon className="w-4 h-4" />
                    Track order
                  </a>
                )}
              </div>
            )}
          </section>
        )}

        {(userId || profile.user_id) && (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">
              Order history
            </h4>
            {storeOrdersLoading && <Skeleton />}
            {storeOrdersError && !storeOrders.length && (
              <p className="text-xs text-text-secondary">{storeOrdersError}</p>
            )}
            {!storeOrdersLoading && storeOrders.length === 0 && !storeOrdersError && (
              <p className="text-xs text-text-secondary">No store orders found</p>
            )}
            {storeOrders.length > 0 && (
              <ul className="space-y-2">
                {storeOrders.map((storeOrder) => {
                  const oid =
                    storeOrder.orderId ||
                    storeOrder.order_number ||
                    storeOrder._id;
                  const total =
                    storeOrder.grandTotal ?? storeOrder.total ?? storeOrder.total_amount;
                  return (
                    <li
                      key={String(storeOrder._id || oid)}
                      className="rounded-card border border-slate-100 dark:border-slate-800 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                          #{oid}
                        </code>
                        {storeOrder.status && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 shrink-0">
                            {storeOrder.status}
                          </span>
                        )}
                      </div>
                      {total != null && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          BDT {Number(total).toLocaleString()}
                          {storeOrder.createdAt
                            ? ` · ${relativeTimeBn(storeOrder.createdAt)}`
                            : ''}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">
            Previous chats
          </h4>
          {previousChats.length === 0 ? (
            <p className="text-xs text-text-secondary">No previous chats</p>
          ) : (
            <ul className="space-y-2">
              {previousChats.map((chat) => (
                <li key={getRoomId(chat)}>
                  <button
                    type="button"
                    onClick={() => openPrevious(chat)}
                    className="w-full text-left rounded-card border border-slate-100 dark:border-slate-800 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition duration-200"
                  >
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                      {chat.last_message || 'Resolved chat'}
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

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">
            Quick actions
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                if (onTransfer) onTransfer();
                else setShowTransfer(true);
              }}
              className="rounded-btn border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              ↗️ Transfer
            </button>
            <button
              type="button"
              onClick={() => onNote?.()}
              className="rounded-btn border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              📋 Note
            </button>
            <button
              type="button"
              onClick={() => {
                if (onTag) onTag();
                else setShowTag(true);
              }}
              className="rounded-btn border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              🏷️ Tag
            </button>
            <button
              type="button"
              onClick={() => toast('Block feature coming soon', { icon: '🚫' })}
              className="rounded-btn border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs font-medium text-danger hover:bg-red-50 dark:hover:bg-red-950/30 transition"
            >
              🚫 Block
            </button>
          </div>
        </section>
      </div>

      <TransferModal
        roomId={activeRoomId}
        open={showTransfer}
        onClose={() => setShowTransfer(false)}
      />
      <TagModal
        roomId={activeRoomId}
        open={showTag}
        onClose={() => setShowTag(false)}
        existing={room.tags || []}
      />
    </aside>
  );
}
