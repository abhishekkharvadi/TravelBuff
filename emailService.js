import net from 'net';
import tls from 'tls';
import crypto from 'crypto';
import { db } from './db.js';

let reminderInterval = null;

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeSecureMode(val, port = 587) {
  if (val === 'tls' || val === 'starttls' || val === 'none') return val;
  if (val === true) return 'tls';
  if (val === false) return Number(port) === 465 ? 'tls' : 'starttls';
  return Number(port) === 465 ? 'tls' : 'starttls';
}

export async function getSmtpSettings(includePassword = false) {
  const defaultObj = {
    enabled: false,
    host: '',
    port: 587,
    secure: 'starttls',
    auth_user: '',
    username: '',
    auth_pass: '',
    password: '',
    has_password: false,
    hasPassword: false,
    from_name: 'TravelBuff',
    fromName: 'TravelBuff',
    from_email: '',
    fromEmail: '',
    reply_to: '',
    app_public_url: '',
    appBaseUrl: ''
  };
  try {
    const row = await db.get("SELECT value FROM app_config WHERE key = 'smtp_settings'");
    if (!row || !row.value) {
      return defaultObj;
    }
    const parsed = JSON.parse(row.value);
    const rawPass = parsed.auth_pass ?? parsed.password ?? '';
    const hasPassword = Boolean(rawPass && String(rawPass).length > 0);
    const port = Number(parsed.port) || 587;
    const secureMode = normalizeSecureMode(parsed.secure, port);
    const authUser = parsed.auth_user ?? parsed.username ?? '';
    const fromName = parsed.from_name ?? parsed.fromName ?? 'TravelBuff';
    const fromEmail = parsed.from_email ?? parsed.fromEmail ?? '';
    const appPublicUrl = parsed.app_public_url ?? parsed.appBaseUrl ?? '';
    const passVal = includePassword ? rawPass : '';

    return {
      enabled: Boolean(parsed.enabled),
      host: parsed.host || '',
      port,
      secure: secureMode,
      auth_user: authUser,
      username: authUser,
      auth_pass: passVal,
      password: includePassword ? rawPass : (hasPassword ? '••••••••' : ''),
      has_password: hasPassword,
      hasPassword,
      from_name: fromName,
      fromName,
      from_email: fromEmail,
      fromEmail,
      reply_to: parsed.reply_to || '',
      app_public_url: appPublicUrl,
      appBaseUrl: appPublicUrl
    };
  } catch (err) {
    console.error('[EmailService] Failed to parse smtp_settings:', err.message);
    return defaultObj;
  }
}

export function resolveSmtpSettingsInput(input = {}, existing = {}) {
  const rawInputPass = input.auth_pass !== undefined ? input.auth_pass : input.password;
  const nextPass =
    rawInputPass !== undefined && rawInputPass !== '' && rawInputPass !== '••••••••'
      ? String(rawInputPass)
      : (input.clear_password ? '' : (existing.auth_pass || existing.password || ''));

  const port = Number(input.port ?? existing.port) || 587;
  const secureMode = normalizeSecureMode(input.secure ?? existing.secure, port);
  const authUser = String(input.auth_user ?? input.username ?? existing.auth_user ?? '').trim();
  const fromName = String(input.from_name ?? input.fromName ?? existing.from_name ?? 'TravelBuff').trim();
  const fromEmail = String(input.from_email ?? input.fromEmail ?? existing.from_email ?? '').trim();
  const appPublicUrl = String(input.app_public_url ?? input.appBaseUrl ?? existing.app_public_url ?? '').trim().replace(/\/+$/, '');

  return {
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : Boolean(existing.enabled),
    host: String(input.host ?? existing.host ?? '').trim(),
    port,
    secure: secureMode,
    auth_user: authUser,
    username: authUser,
    auth_pass: nextPass,
    password: nextPass,
    from_name: fromName,
    fromName,
    from_email: fromEmail,
    fromEmail,
    reply_to: String(input.reply_to ?? existing.reply_to ?? '').trim(),
    app_public_url: appPublicUrl,
    appBaseUrl: appPublicUrl
  };
}

export async function saveSmtpSettings(input) {
  const existing = await getSmtpSettings(true);
  const toSave = resolveSmtpSettingsInput(input, existing);

  await db.run(
    "INSERT INTO app_config (key, value) VALUES ('smtp_settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [JSON.stringify(toSave)]
  );

  return getSmtpSettings(false);
}

export async function isSmtpEnabled() {
  const cfg = await getSmtpSettings(true);
  return Boolean(cfg.enabled && cfg.host && cfg.from_email);
}

function encodeMimeHeader(text) {
  if (!text) return '';
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(String(text), 'utf8').toString('base64')}?=`;
}

function chunkBase64(str) {
  const b64 = Buffer.from(String(str || ''), 'utf8').toString('base64');
  return b64.match(/.{1,76}/g)?.join('\r\n') || '';
}

function buildMimeMessage({ fromName, fromEmail, toList, replyTo, subject, text, html }) {
  const boundary = `----=_TravelBuffPart_${crypto.randomBytes(12).toString('hex')}`;
  const msgId = `<${crypto.randomUUID()}@${fromEmail.split('@')[1] || 'travelbuff.local'}>`;
  const dateHeader = new Date().toUTCString();
  const safeFromName = fromName ? `${encodeMimeHeader(fromName)} <${fromEmail}>` : fromEmail;

  const headers = [
    `From: ${safeFromName}`,
    `To: ${toList.join(', ')}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${encodeMimeHeader(subject)}`,
    `Date: ${dateHeader}`,
    `Message-ID: ${msgId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`
  ];

  const plainBody = text || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
  const htmlBody = html || `<pre>${escapeHtml(plainBody)}</pre>`;

  const bodyLines = [
    ...headers,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    chunkBase64(plainBody),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    chunkBase64(htmlBody),
    '',
    `--${boundary}--`,
    ''
  ];

  // Dot-stuffing per RFC 5321
  return bodyLines
    .join('\r\n')
    .split('\r\n')
    .map(line => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
}

async function sendRawSmtp(cfg, recipients, rawMimeMessage) {
  return new Promise((resolve, reject) => {
    const host = cfg.host;
    const port = Number(cfg.port) || 587;
    const implicitTls = cfg.secure === 'tls' || cfg.secure === true || port === 465;
    const disableStartTls = cfg.secure === 'none';
    let socket = null;
    let buffer = '';
    let currentLines = [];
    let pendingResolver = null;
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      try {
        if (socket) socket.destroy();
      } catch (_) {}
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const succeed = (val) => {
      if (settled) return;
      settled = true;
      try {
        if (socket) socket.end();
      } catch (_) {}
      resolve(val);
    };

    const attachListeners = (sock) => {
      sock.setTimeout(15000);
      sock.on('timeout', () => fail(new Error('SMTP connection timed out (15s)')));
      sock.on('error', (err) => fail(new Error(`SMTP socket error: ${err.message}`)));
      sock.on('close', () => {
        if (!settled && pendingResolver) {
          fail(new Error('SMTP connection closed unexpectedly by server'));
        }
      });
      sock.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let idx;
        while ((idx = buffer.indexOf('\r\n')) !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          currentLines.push(line);
          // Multi-line responses have a hyphen at index 3 (e.g. "250-PIPELINING"), final line has space ("250 OK")
          if (line.length >= 3 && (line.length === 3 || line[3] === ' ')) {
            const code = parseInt(line.slice(0, 3), 10);
            const fullText = currentLines.join('\n');
            currentLines = [];
            if (pendingResolver) {
              const r = pendingResolver;
              pendingResolver = null;
              r({ code, text: fullText });
            }
          }
        }
      });
    };

    const readResponse = () =>
      new Promise((res, rej) => {
        pendingResolver = ({ code, text }) => {
          if (code >= 400) {
            rej(new Error(`SMTP Error (${code}): ${text}`));
          } else {
            res({ code, text });
          }
        };
      });

    const sendCommand = async (cmd) => {
      const p = readResponse();
      socket.write(`${cmd}\r\n`);
      return p;
    };

    const runSession = async () => {
      try {
        // 1. Wait for 220 banner
        await readResponse();

        // 2. EHLO
        const ehloRes = await sendCommand('EHLO travelbuff.local');

        // 3. Upgrade via STARTTLS if not already TLS and server supports STARTTLS
        if (!implicitTls && !disableStartTls && /STARTTLS/i.test(ehloRes.text)) {
          await sendCommand('STARTTLS');
          socket.removeAllListeners('data');
          socket.removeAllListeners('error');
          socket.removeAllListeners('timeout');
          socket.removeAllListeners('close');

          socket = await new Promise((tlsRes, tlsRej) => {
            const tlsSock = tls.connect(
              {
                socket,
                host,
                servername: host
              },
              () => tlsRes(tlsSock)
            );
            tlsSock.once('error', tlsRej);
          });
          attachListeners(socket);
          await sendCommand('EHLO travelbuff.local');
        }

        // 4. Authenticate if credentials provided
        if (cfg.auth_user && cfg.auth_pass) {
          const authPlain = Buffer.from(`\u0000${cfg.auth_user}\u0000${cfg.auth_pass}`, 'utf8').toString('base64');
          try {
            await sendCommand(`AUTH PLAIN ${authPlain}`);
          } catch (_) {
            // Fallback to AUTH LOGIN
            await sendCommand('AUTH LOGIN');
            await sendCommand(Buffer.from(cfg.auth_user, 'utf8').toString('base64'));
            await sendCommand(Buffer.from(cfg.auth_pass, 'utf8').toString('base64'));
          }
        }

        // 5. MAIL FROM
        await sendCommand(`MAIL FROM:<${cfg.from_email}>`);

        // 6. RCPT TO for each recipient
        for (const rcpt of recipients) {
          await sendCommand(`RCPT TO:<${rcpt}>`);
        }

        // 7. DATA
        await sendCommand('DATA');
        const dataDone = readResponse();
        socket.write(`${rawMimeMessage}\r\n.\r\n`);
        await dataDone;

        // 8. QUIT
        try {
          await sendCommand('QUIT');
        } catch (_) {}

        succeed({ sent: true, recipients });
      } catch (err) {
        fail(err);
      }
    };

    try {
      socket = implicitTls
        ? tls.connect({ host, port, servername: host })
        : net.createConnection({ host, port });
      attachListeners(socket);
      runSession();
    } catch (err) {
      fail(err);
    }
  });
}

export async function sendEmail({ to, subject, html, text, replyTo }, overrideSettings = null) {
  const cfg = overrideSettings || (await getSmtpSettings(true));
  if (!cfg.enabled && !overrideSettings) {
    throw new Error('SMTP email notifications are not enabled in Settings.');
  }
  if (!cfg.host || !cfg.from_email) {
    throw new Error('SMTP host and From Email are required.');
  }

  const rawRecipients = Array.isArray(to) ? to : String(to || '').split(/[,;]+/);
  const recipients = rawRecipients
    .map(r => r.trim())
    .filter(r => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r));

  if (recipients.length === 0) {
    throw new Error('At least one valid recipient email address is required.');
  }

  const rawMime = buildMimeMessage({
    fromName: cfg.from_name || 'TravelBuff',
    fromEmail: cfg.from_email,
    toList: recipients,
    replyTo: replyTo || cfg.reply_to || '',
    subject,
    text,
    html
  });

  return sendRawSmtp(cfg, recipients, rawMime);
}

function wrapEmailLayout(title, subtitle, bodyHtml, appUrl = '') {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;">
  <div style="max-width:640px;margin:0 auto;padding:28px 16px;">
    <div style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border:1px solid rgba(148,163,184,0.2);border-radius:16px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.35);">
      <div style="padding:24px 28px;background:linear-gradient(135deg,#3b82f6 0%,#6366f1 100%);color:#ffffff;">
        <div style="font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;opacity:0.9;margin-bottom:6px;">✈️ TravelBuff</div>
        <h1 style="margin:0;font-size:22px;font-weight:700;line-height:1.3;">${escapeHtml(title)}</h1>
        ${subtitle ? `<p style="margin:6px 0 0 0;font-size:14px;opacity:0.92;">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      <div style="padding:26px 28px;color:#e2e8f0;font-size:14px;line-height:1.6;">
        ${bodyHtml}
        ${
          appUrl
            ? `<div style="margin-top:26px;text-align:center;">
                 <a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Open TravelBuff</a>
               </div>`
            : ''
        }
      </div>
      <div style="padding:16px 28px;background:rgba(15,23,42,0.7);border-top:1px solid rgba(148,163,184,0.12);font-size:12px;color:#94a3b8;text-align:center;">
        Sent by your self-hosted TravelBuff instance
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function sendTestEmail(toEmail, testSettings = null) {
  const existing = await getSmtpSettings(true);
  const cfg = testSettings ? resolveSmtpSettingsInput(testSettings, existing) : existing;
  const html = wrapEmailLayout(
    'SMTP Configuration Verified!',
    'Your TravelBuff instance is ready to send email notifications.',
    `<p style="margin-top:0;">Hello,</p>
     <p>This is a test email from your <strong>TravelBuff</strong> server (<code>${escapeHtml(cfg.host)}:${escapeHtml(cfg.port)}</code>).</p>
     <p style="margin-bottom:0;">You can now use email notifications for trip sharing, emailing printable trip itineraries, expense settlement summaries, password recovery, and upcoming trip reminders.</p>`,
    cfg.app_public_url
  );
  return sendEmail(
    {
      to: toEmail,
      subject: '✅ TravelBuff SMTP Test Email',
      html
    },
    { ...cfg, enabled: true }
  );
}

export async function sendTripSharedEmail({ toEmail, recipientName, ownerName, tripName, startDate, endDate, permission }) {
  if (!(await isSmtpEnabled())) return { skipped: true };
  const cfg = await getSmtpSettings(true);
  const roleLabel = permission === 'edit' ? 'Co-Editor (Can Edit)' : 'Viewer (View-Only)';
  const dateRange = startDate ? `${startDate}${endDate ? ` → ${endDate}` : ''}` : 'Flexible Dates';

  const html = wrapEmailLayout(
    `${ownerName} shared a trip with you`,
    tripName,
    `<p style="margin-top:0;">Hi <strong>${escapeHtml(recipientName || 'Traveler')}</strong>,</p>
     <p><strong>${escapeHtml(ownerName)}</strong> has shared the trip <strong>"${escapeHtml(tripName)}"</strong> with your local TravelBuff account.</p>
     <div style="background:rgba(30,41,59,0.8);border:1px solid rgba(148,163,184,0.2);border-radius:12px;padding:16px;margin:18px 0;">
       <div style="margin-bottom:8px;"><strong>📅 Dates:</strong> ${escapeHtml(dateRange)}</div>
       <div><strong>🔐 Access Level:</strong> <span style="color:#60a5fa;font-weight:600;">${escapeHtml(roleLabel)}</span></div>
     </div>
     <p style="margin-bottom:0;">Log in to TravelBuff and open the <strong>Trips</strong> tab to view the itinerary, reservations, and expenses.</p>`,
    cfg.app_public_url
  );

  return sendEmail({
    to: toEmail,
    subject: `🤝 ${ownerName} shared "${tripName}" with you on TravelBuff`,
    html
  });
}

export async function sendTripLeftEmails({ ownerUser, leaverUser, trip, removedByOwner = false }) {
  if (!(await isSmtpEnabled())) return { skipped: true };
  const cfg = await getSmtpSettings(true);
  const ownerName = ownerUser?.display_name || ownerUser?.username || 'Trip Owner';
  const leaverName = leaverUser?.display_name || leaverUser?.username || 'Traveler';
  const leaverHandle = leaverUser?.username ? `@${leaverUser.username}` : '';
  const tripName = trip?.name || 'Shared Trip';
  const dateRange = trip?.start_date
    ? `${trip.start_date}${trip.end_date ? ` → ${trip.end_date}` : ''}`
    : 'Flexible Dates';

  const results = { leaverSent: false, ownerSent: false };

  // 1. Send email to the user who left (or was removed)
  if (leaverUser?.email && Number(leaverUser.email_notifications_enabled ?? 1) !== 0) {
    try {
      const leaverTitle = removedByOwner
        ? `Your access to "${tripName}" was removed`
        : `You left "${tripName}"`;
      const leaverHtml = wrapEmailLayout(
        leaverTitle,
        `Shared by ${ownerName}`,
        `<p style="margin-top:0;">Hi <strong>${escapeHtml(leaverName)}</strong>,</p>
         <p>${
           removedByOwner
             ? `<strong>${escapeHtml(ownerName)}</strong> has removed your shared access to the trip <strong>"${escapeHtml(tripName)}"</strong>.`
             : `You have left the shared trip <strong>"${escapeHtml(tripName)}"</strong> (shared by <strong>${escapeHtml(ownerName)}</strong>).`
         }</p>
         <div style="background:rgba(30,41,59,0.8);border:1px solid rgba(148,163,184,0.2);border-radius:12px;padding:16px;margin:18px 0;">
           <div style="margin-bottom:6px;"><strong>🗺️ Trip:</strong> ${escapeHtml(tripName)}</div>
           <div><strong>📅 Dates:</strong> ${escapeHtml(dateRange)}</div>
         </div>
         <p style="margin-bottom:0;">This trip is no longer listed in your shared Trips workspace.</p>`,
        cfg.app_public_url
      );

      await sendEmail({
        to: leaverUser.email,
        subject: removedByOwner
          ? `🔒 Access removed for shared trip "${tripName}"`
          : `👋 You left shared trip "${tripName}"`,
        html: leaverHtml
      });
      results.leaverSent = true;
    } catch (err) {
      console.warn('[EmailService] Failed to send trip-left email to collaborator:', err.message);
    }
  }

  // 2. Send email to the main user (trip owner) when a collaborator leaves
  if (!removedByOwner && ownerUser?.email && Number(ownerUser.email_notifications_enabled ?? 1) !== 0) {
    try {
      const ownerHtml = wrapEmailLayout(
        `${leaverName} left your shared trip`,
        tripName,
        `<p style="margin-top:0;">Hi <strong>${escapeHtml(ownerName)}</strong>,</p>
         <p><strong>${escapeHtml(leaverName)}</strong>${leaverHandle ? ` (<code>${escapeHtml(leaverHandle)}</code>)` : ''} has left your shared trip <strong>"${escapeHtml(tripName)}"</strong>.</p>
         <div style="background:rgba(30,41,59,0.8);border:1px solid rgba(148,163,184,0.2);border-radius:12px;padding:16px;margin:18px 0;">
           <div style="margin-bottom:6px;"><strong>🗺️ Trip:</strong> ${escapeHtml(tripName)}</div>
           <div style="margin-bottom:6px;"><strong>📅 Dates:</strong> ${escapeHtml(dateRange)}</div>
           <div><strong>👤 Collaborator:</strong> ${escapeHtml(leaverName)}${leaverHandle ? ` (${escapeHtml(leaverHandle)})` : ''}</div>
         </div>
         <p style="margin-bottom:0;">You can manage active trip collaborators anytime from the <strong>🔗 Share</strong> menu in TravelBuff.</p>`,
        cfg.app_public_url
      );

      await sendEmail({
        to: ownerUser.email,
        subject: `👋 ${leaverName} left your shared trip "${tripName}"`,
        html: ownerHtml
      });
      results.ownerSent = true;
    } catch (err) {
      console.warn('[EmailService] Failed to send trip-left email to owner:', err.message);
    }
  }

  return results;
}

export async function sendAdminCredentialsEmail({ toEmail, username, displayName, tempPassword, isNewUser }) {
  if (!(await isSmtpEnabled())) return { skipped: true };
  const cfg = await getSmtpSettings(true);
  const title = isNewUser ? 'Welcome to TravelBuff!' : 'Your TravelBuff Password Was Reset';

  const html = wrapEmailLayout(
    title,
    `Account details for @${username}`,
    `<p style="margin-top:0;">Hi <strong>${escapeHtml(displayName || username)}</strong>,</p>
     <p>${
       isNewUser
         ? 'An administrator has created a TravelBuff account for you on this instance.'
         : 'An administrator has reset the password for your TravelBuff account.'
     }</p>
     <div style="background:rgba(30,41,59,0.85);border:1px solid rgba(148,163,184,0.25);border-radius:12px;padding:16px;margin:18px 0;font-family:monospace;font-size:14px;">
       <div style="margin-bottom:8px;"><strong>Username:</strong> ${escapeHtml(username)}</div>
       <div><strong>Temporary Password:</strong> <span style="color:#38bdf8;">${escapeHtml(tempPassword)}</span></div>
     </div>
     <p style="margin-bottom:0;">Please sign in and update your password from the Profile menu.</p>`,
    cfg.app_public_url
  );

  return sendEmail({
    to: toEmail,
    subject: `🔐 ${title}`,
    html
  });
}

export async function sendPasswordResetCodeEmail({ toEmail, username, resetCode }) {
  if (!(await isSmtpEnabled())) {
    throw new Error('SMTP is not enabled on this server.');
  }
  const cfg = await getSmtpSettings(true);
  const html = wrapEmailLayout(
    'Password Reset Verification Code',
    `Account: @${username}`,
    `<p style="margin-top:0;">Hello <strong>${escapeHtml(username)}</strong>,</p>
     <p>We received a request to reset your TravelBuff password. Enter the 6-digit verification code below on the login screen (valid for <strong>15 minutes</strong>):</p>
     <div style="text-align:center;margin:24px 0;">
       <div style="display:inline-block;padding:16px 32px;background:rgba(59,130,246,0.15);border:2px dashed #60a5fa;border-radius:12px;font-size:28px;font-weight:800;letter-spacing:6px;color:#93c5fd;">
         ${escapeHtml(resetCode)}
       </div>
     </div>
     <p style="margin-bottom:0;color:#94a3b8;font-size:13px;">If you did not request a password reset, you can safely ignore this email.</p>`,
    cfg.app_public_url
  );

  return sendEmail({
    to: toEmail,
    subject: `🔑 Your TravelBuff Password Reset Code (${resetCode})`,
    html
  });
}

export async function sendExpenseSettlementEmail({ toEmails, senderName, tripName, currency, totalSpent, memberBalances, settlements }) {
  if (!(await isSmtpEnabled())) {
    throw new Error('SMTP is not enabled in Settings.');
  }
  const cfg = await getSmtpSettings(true);

  const settlementsRows =
    settlements && settlements.length > 0
      ? settlements
          .map(
            s => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(15,23,42,0.6);border-radius:8px;margin-bottom:8px;border:1px solid rgba(148,163,184,0.15);">
                    <span><strong>${escapeHtml(s.from)}</strong> pays <strong>${escapeHtml(s.to)}</strong></span>
                    <span style="color:#34d399;font-weight:700;margin-left:12px;">${escapeHtml(currency)} ${Number(s.amount || 0).toFixed(2)}</span>
                  </div>`
          )
          .join('')
      : `<div style="padding:12px;color:#94a3b8;">All settled up! No pending transfers required.</div>`;

  const balancesRows =
    memberBalances && memberBalances.length > 0
      ? `<table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;">
           <thead>
             <tr style="border-bottom:1px solid rgba(148,163,184,0.2);text-align:left;color:#94a3b8;">
               <th style="padding:8px 6px;">Member</th>
               <th style="padding:8px 6px;text-align:right;">Paid</th>
               <th style="padding:8px 6px;text-align:right;">Share</th>
               <th style="padding:8px 6px;text-align:right;">Net</th>
             </tr>
           </thead>
           <tbody>
             ${memberBalances
               .map(
                 m => `<tr style="border-bottom:1px solid rgba(148,163,184,0.1);">
                         <td style="padding:8px 6px;font-weight:600;">${escapeHtml(m.name)}</td>
                         <td style="padding:8px 6px;text-align:right;">${escapeHtml(currency)} ${Number(m.paid || 0).toFixed(2)}</td>
                         <td style="padding:8px 6px;text-align:right;">${escapeHtml(currency)} ${Number(m.share || 0).toFixed(2)}</td>
                         <td style="padding:8px 6px;text-align:right;font-weight:700;color:${Number(m.net) >= 0 ? '#34d399' : '#f87171'};">
                           ${Number(m.net) >= 0 ? '+' : ''}${escapeHtml(currency)} ${Number(m.net || 0).toFixed(2)}
                         </td>
                       </tr>`
               )
               .join('')}
           </tbody>
         </table>`
      : '';

  const html = wrapEmailLayout(
    `Expense Settlement: ${tripName}`,
    `Shared by ${senderName} • Total Group Spend: ${currency} ${Number(totalSpent || 0).toFixed(2)}`,
    `<h3 style="margin:0 0 10px 0;color:#93c5fd;font-size:15px;">💸 Who Owes Whom (Recommended Transfers)</h3>
     ${settlementsRows}
     ${
       balancesRows
         ? `<h3 style="margin:22px 0 8px 0;color:#93c5fd;font-size:15px;">📊 Per-Person Breakdown</h3>${balancesRows}`
         : ''
     }`,
    cfg.app_public_url
  );

  return sendEmail({
    to: toEmails,
    subject: `💸 Expense Settlement Summary: ${tripName}`,
    html
  });
}

export async function sendTripDetailsEmail({ toEmails, senderName, tripName, dateRange, bodySectionsHtml }) {
  if (!(await isSmtpEnabled())) {
    throw new Error('SMTP is not enabled in Settings.');
  }
  const cfg = await getSmtpSettings(true);

  const html = wrapEmailLayout(
    tripName,
    `${dateRange || 'Trip Summary'} • Sent by ${senderName}`,
    bodySectionsHtml,
    cfg.app_public_url
  );

  return sendEmail({
    to: toEmails,
    subject: `🗺️ Trip Details & Itinerary: ${tripName}`,
    html
  });
}

export async function checkAndSendUpcomingTripReminders() {
  try {
    if (!(await isSmtpEnabled())) return;
    const cfg = await getSmtpSettings(true);

    const users = await db.all(
      `SELECT id, username, display_name, email, email_notifications_enabled, trip_reminder_days
       FROM users
       WHERE email IS NOT NULL AND TRIM(email) != ''
         AND COALESCE(email_notifications_enabled, 1) = 1
         AND COALESCE(trip_reminder_days, 3) > 0`
    );

    if (!users || users.length === 0) return;

    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const u of users) {
      const targetDays = Number(u.trip_reminder_days) || 3;
      const trips = await db.all(
        `SELECT DISTINCT t.*
         FROM trips t
         LEFT JOIN trip_shares ts ON ts.trip_id = t.id
         WHERE (t.user_id = ? OR ts.shared_with_user_id = ?)
           AND t.visited = 0
           AND t.start_date IS NOT NULL
           AND TRIM(t.start_date) != ''`,
        [u.id, u.id]
      );

      for (const trip of trips) {
        const parts = String(trip.start_date).split('-').map(Number);
        if (parts.length !== 3 || parts.some(isNaN)) continue;
        const startMidnight = new Date(parts[0], parts[1] - 1, parts[2]);
        const diffDays = Math.round((startMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

        if (diffDays >= 0 && diffDays <= targetDays) {
          const alreadySent = await db.get(
            'SELECT id FROM trip_email_reminders WHERE trip_id = ? AND user_id = ? AND trip_start_date = ?',
            [trip.id, u.id, trip.start_date]
          );
          if (alreadySent) continue;

          const resCountRow = await db.get('SELECT COUNT(*) as cnt FROM reservations WHERE trip_id = ?', [trip.id]);
          const stopCountRow = await db.get('SELECT COUNT(*) as cnt FROM itinerary_items WHERE trip_id = ?', [trip.id]);

          const html = wrapEmailLayout(
            `Upcoming Trip Reminder: ${trip.name}`,
            `Starts in ${diffDays === 0 ? 'Today!' : `${diffDays} day${diffDays === 1 ? '' : 's'}`} (${trip.start_date})`,
            `<p style="margin-top:0;">Hi <strong>${escapeHtml(u.display_name || u.username)}</strong>,</p>
             <p>Your upcoming trip <strong>"${escapeHtml(trip.name)}"</strong> is right around the corner!</p>
             <div style="background:rgba(30,41,59,0.8);border:1px solid rgba(148,163,184,0.2);border-radius:12px;padding:16px;margin:16px 0;">
               <div style="margin-bottom:6px;"><strong>📅 Start Date:</strong> ${escapeHtml(trip.start_date)}${trip.end_date ? ` → ${escapeHtml(trip.end_date)}` : ''}</div>
               <div style="margin-bottom:6px;"><strong>📍 Planned Stops:</strong> ${Number(stopCountRow?.cnt || 0)} itinerary items</div>
               <div><strong>🎟️ Saved Reservations:</strong> ${Number(resCountRow?.cnt || 0)} bookings</div>
             </div>
             <p style="margin-bottom:0;">Tip: Open <strong>Trip Mode</strong> on your phone before departure to make sure your itinerary and reservation attachments are cached offline.</p>`,
            cfg.app_public_url
          );

          await sendEmail({
            to: u.email,
            subject: `✈️ Reminder: "${trip.name}" starts ${diffDays === 0 ? 'today' : `in ${diffDays} day${diffDays === 1 ? '' : 's'}`}!`,
            html
          });

          await db.run(
            'INSERT OR IGNORE INTO trip_email_reminders (id, trip_id, user_id, trip_start_date) VALUES (?, ?, ?, ?)',
            [crypto.randomUUID(), trip.id, u.id, trip.start_date]
          );
        }
      }
    }
  } catch (err) {
    console.error('[EmailService] Reminder scheduler error:', err.message);
  }
}

export function initTripReminderScheduler() {
  if (reminderInterval) clearInterval(reminderInterval);
  setTimeout(() => {
    checkAndSendUpcomingTripReminders().catch(() => {});
  }, 15000);
  // Check every 6 hours
  reminderInterval = setInterval(() => {
    checkAndSendUpcomingTripReminders().catch(() => {});
  }, 6 * 60 * 60 * 1000);
}
