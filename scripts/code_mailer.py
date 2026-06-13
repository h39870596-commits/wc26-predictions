#!/usr/bin/env python3
"""
解锁码自动发送机器人(纯本机运行,由 launchd 每 10 分钟调一次,不消耗 Claude 额度)。

流程:收件箱中查找未读的「WC26」赞助凭证邮件 → 校验邮件里有支付单号(≥12位数字)
→ 按「单日/全程」从私密码池取一个未用过的解锁码 → 自动回信发码 → 记账(用过的码、
已处理的单号),防重复发放。

启用条件:存在 private/mail.env(两行):
    GMAIL_USER=h39870596@gmail.com
    GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   # Google「应用专用密码」,非登录密码
文件不存在时本脚本静默退出(launchd 装好也不会有任何动作)。

防滥用:无单号→回信索要单号不发码;同一单号只发一次;单次最多发 10 封、
每天最多发 30 个码;全部动作记录在 private/mailer.log。
已知边界:无法 100% 核验单号真伪(个人收款码无对账 API),小额可接受;
彻底方案是商户 API 自动开通(见 server/README.md)。
"""
import email, email.header, email.utils, imaplib, os, re, smtplib, sys, time
from email.mime.text import MIMEText

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRIV = os.path.join(ROOT, 'private')
ENV_F = os.path.join(PRIV, 'mail.env')
CODES_F = os.path.join(PRIV, 'codes-private.txt')
USED_F = os.path.join(PRIV, 'codes-used.txt')
TXN_F = os.path.join(PRIV, 'txn-seen.txt')
LOG_F = os.path.join(PRIV, 'mailer.log')
MAX_PER_RUN = 10
MAX_PER_DAY = 30

def log(msg):
    line = time.strftime('%Y-%m-%d %H:%M:%S') + ' ' + msg
    print(line)
    with open(LOG_F, 'a') as f:
        f.write(line + '\n')

def load_env():
    if not os.path.exists(ENV_F):
        return None
    env = {}
    for ln in open(ENV_F):
        ln = ln.strip()
        if ln and not ln.startswith('#') and '=' in ln:
            k, v = ln.split('=', 1)
            env[k.strip()] = v.strip()
    if env.get('GMAIL_USER') and env.get('GMAIL_APP_PASSWORD'):
        return env
    return None

def read_lines(path):
    return [l.rstrip('\n') for l in open(path)] if os.path.exists(path) else []

def available_codes():
    """返回 {'day': [...], 'season': [...]},剔除已用/作废。"""
    used = set()
    for l in read_lines(USED_F):
        m = re.match(r'^(WC26-[A-Z2-9-]+)', l.strip())
        if m:
            used.add(m.group(1))
    pools = {'day': [], 'season': []}
    pool = 'day'
    for l in read_lines(CODES_F):
        s = l.strip()
        if s.startswith('#'):
            if '全程' in s:
                pool = 'season'
            elif '单日' in s:
                pool = 'day'
            continue
        m = re.match(r'^(WC26-[A-Z2-9]{5}-[A-Z2-9]{5})\s*(#.*)?$', s)
        if not m:
            continue
        code, note = m.group(1), (m.group(2) or '')
        if '作废' in note or code in used:
            continue
        pools[pool].append(code)
    return pools

def body_text(msg):
    parts = []
    if msg.is_multipart():
        for p in msg.walk():
            if p.get_content_type() == 'text/plain':
                try:
                    parts.append(p.get_payload(decode=True).decode(p.get_content_charset() or 'utf-8', 'ignore'))
                except Exception:
                    pass
    else:
        try:
            parts.append(msg.get_payload(decode=True).decode(msg.get_content_charset() or 'utf-8', 'ignore'))
        except Exception:
            pass
    return '\n'.join(parts)

def dec_subject(msg):
    try:
        return str(email.header.make_header(email.header.decode_header(msg.get('Subject', ''))))
    except Exception:
        return msg.get('Subject', '')

def send_mail(env, to_addr, subject, body, orig_id=None):
    m = MIMEText(body, 'plain', 'utf-8')
    m['From'] = env['GMAIL_USER']
    m['To'] = to_addr
    m['Subject'] = subject
    if orig_id:
        m['In-Reply-To'] = orig_id
        m['References'] = orig_id
    with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=30) as s:
        s.login(env['GMAIL_USER'], env['GMAIL_APP_PASSWORD'])
        s.sendmail(env['GMAIL_USER'], [to_addr], m.as_string())

CODE_MAIL = '''您好!

感谢赞助支持「世界杯最强AI数据分析」。您的解锁码:

    {code}

使用方法:回到网站 → 点击任意「赞助」按钮打开弹窗 → 在「已有解锁码?」
输入框中粘贴上面的码 → 点「开通」即可查看{scope}。

说明:该码与您的支付一一对应,请勿转发他人;{valid}
本站为体育数据分析平台,内容仅供研究参考,不构成任何投注建议。

—— WC26 AI 数据分析(自动发送)'''

ASK_MAIL = '''您好!

收到您的赞助反馈,但邮件中未找到支付单号,暂时无法自动发码。

请回复本邮件并附上支付单号(微信:账单详情中的「转账单号/交易单号」;
支付宝:账单详情中的「订单号」,一串 12 位以上的数字),收到后会自动回发解锁码。

—— WC26 AI 数据分析(自动发送)'''

def main():
    env = load_env()
    if not env:
        return  # 未配置邮箱凭证,静默退出
    today = time.strftime('%Y-%m-%d')
    sent_today = sum(1 for l in read_lines(USED_F) if today in l)
    if sent_today >= MAX_PER_DAY:
        log('SKIP 已达当日发码上限 %d' % MAX_PER_DAY)
        return

    seen_txn = set(l.strip() for l in read_lines(TXN_F) if l.strip())
    pools = available_codes()

    M = imaplib.IMAP4_SSL('imap.gmail.com')
    M.login(env['GMAIL_USER'], env['GMAIL_APP_PASSWORD'])
    M.select('INBOX')
    # 中文主题在 IMAP SEARCH 不可靠,先取未读再本地过滤
    _, data = M.search(None, 'UNSEEN')
    ids = data[0].split()
    handled = 0
    for num in ids:
        if handled >= MAX_PER_RUN or sent_today + handled >= MAX_PER_DAY:
            break
        _, msgdata = M.fetch(num, '(RFC822)')  # fetch 即标记已读,防止重复处理
        msg = email.message_from_bytes(msgdata[0][1])
        subj = dec_subject(msg)
        if 'WC26' not in subj.upper():
            M.store(num, '-FLAGS', '\\Seen')  # 非本站邮件恢复未读
            continue
        sender = email.utils.parseaddr(msg.get('From', ''))[1]
        if not sender or sender == env['GMAIL_USER']:
            continue
        body = body_text(msg)
        product = 'season' if '全程' in body else 'day'
        txns = [t for t in re.findall(r'\d{12,}', body)]
        txn = txns[0] if txns else None
        orig_id = msg.get('Message-ID')
        if not txn:
            send_mail(env, sender, 'Re: ' + subj, ASK_MAIL, orig_id)
            log('ASK  %s(缺单号)' % sender)
            continue
        if txn in seen_txn:
            log('DUP  %s 单号重复 %s,跳过' % (sender, txn))
            continue
        if not pools[product]:
            log('EMPTY %s 池已无可用码!请运行 scripts/gen_codes.py 补充' % product)
            continue
        code = pools[product].pop(0)
        scope = '今日全部场次的 AI 预测报告' if product == 'day' else '整届赛事每天的全部预测报告'
        valid = '单日码仅兑换当天有效,请尽快使用。' if product == 'day' else '全程码兑换后有效至赛事结束。'
        send_mail(env, sender, 'Re: ' + subj, CODE_MAIL.format(code=code, scope=scope, valid=valid), orig_id)
        with open(USED_F, 'a') as f:
            f.write('%s %s %s txn=%s %s\n' % (code, product, sender, txn, time.strftime('%Y-%m-%d %H:%M')))
        with open(TXN_F, 'a') as f:
            f.write(txn + '\n')
        seen_txn.add(txn)
        handled += 1
        log('SENT %s 码=%s(%s) 单号=%s' % (sender, code, product, txn))
    M.logout()
    if handled:
        log('DONE 本次发码 %d 个' % handled)

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        log('ERROR ' + repr(e))
        sys.exit(0)  # launchd 下静默失败,下轮重试
