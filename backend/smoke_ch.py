"""Smoke-тест системы каналов (шаги 2-3)."""
import models
from database import init_db
init_db()
from fastapi.testclient import TestClient
import main
from database import engine
from models import User
from sqlmodel import Session, select

with Session(engine) as s:
    for n in ('chtest', 'chsub', 'chsub2'):
        if not s.exec(select(User).where(User.username == n)).first():
            s.add(User(username=n, display_name=n, password_hash='x'))
    s.commit()
    ids = {u.username: u.id for u in s.exec(select(User)).all()}


def make(uid):
    def _cu():
        with Session(engine) as s:
            return s.get(User, uid)
    return _cu


main.app.dependency_overrides[main.get_current_user] = make(ids['chtest'])
c = TestClient(main.app)

# --- публичный канал + посты (шаг 2) ---
print('create:', c.post('/api/channels', json={'title': 'T', 'custom_slug': 'tst_ch', 'is_public': False}).status_code)
cid = c.get('/api/channels/my').json()[0]['id']
pid = c.post(f'/api/channels/{cid}/posts', json={'text': 'p1'}).json()['post']['id']

# --- приватный канал: подписка -> заявка ---
main.app.dependency_overrides[main.get_current_user] = make(ids['chsub'])
print('sub ->', c.post(f'/api/channels/{cid}/subscribe').json()['status'])
print('dup req:', c.post(f'/api/channels/{cid}/subscribe').status_code)

# --- админ одобряет заявку ---
main.app.dependency_overrides[main.get_current_user] = make(ids['chtest'])
reqs = c.get(f'/api/channels/{cid}/requests').json()
print('requests:', len(reqs))
print('approve:', c.patch(f"/api/channels/{cid}/requests/{reqs[0]['id']}?action=approve").json()['status'])

# --- комментарии ---
main.app.dependency_overrides[main.get_current_user] = make(ids['chsub'])
c1 = c.post(f'/api/channels/posts/{pid}/comments', json={'text': 'root'}).json()['comment']
main.app.dependency_overrides[main.get_current_user] = make(ids['chsub2'])
print('comment non-sub:', c.post(f'/api/channels/posts/{pid}/comments', json={'text': 'x'}).status_code)
main.app.dependency_overrides[main.get_current_user] = make(ids['chsub'])
c2 = c.post(f'/api/channels/posts/{pid}/comments', json={'text': 'reply', 'parent_comment_id': c1['id']}).json()['comment']
tree = c.get(f'/api/channels/posts/{pid}/comments').json()['comments']
print('tree root:', tree[0]['text'], '-> replies:', [r['text'] for r in tree[0]['replies']])

# --- инвайт с автоодобрением (создаёт владелец) ---
main.app.dependency_overrides[main.get_current_user] = make(ids['chtest'])
inv = c.post(f'/api/channels/{cid}/invites?auto_approve=true').json()
main.app.dependency_overrides[main.get_current_user] = make(ids['chsub2'])
print('join by invite:', c.post('/api/channels/join-by-invite', json={'token': inv['token']}).json()['status'])

# --- редактирование/удаление коммента (каскад ветки) ---
main.app.dependency_overrides[main.get_current_user] = make(ids['chsub'])
print('edit cmt:', c.patch(f"/api/channels/posts/{pid}/comments/{c1['id']}", json={'text': 'root!'}).status_code)
print('delete cmt:', c.delete(f"/api/channels/posts/{pid}/comments/{c1['id']}").status_code)
tree = c.get(f'/api/channels/posts/{pid}/comments').json()
print('after delete: total =', tree['total'])

# --- чужой коммент нельзя редактировать ---
main.app.dependency_overrides[main.get_current_user] = make(ids['chsub2'])
c3 = c.post(f'/api/channels/posts/{pid}/comments', json={'text': 'mine'}).json()['comment']
main.app.dependency_overrides[main.get_current_user] = make(ids['chsub'])
print('edit foreign:', c.patch(f"/api/channels/posts/{pid}/comments/{c3['id']}", json={'text': 'hack'}).status_code)

# --- Шаг 4: агрегатор лент ---
main.app.dependency_overrides[main.get_current_user] = make(ids['chsub'])
feed = c.get('/api/feed/chats-and-channels').json()
ch_item = next((i for i in feed if i['is_channel']), None)
print('feed channels:', len([i for i in feed if i['is_channel']]), 'item:', ch_item and ch_item['name'])

# --- Шаг 4: модерация каналов (только по жалобе) ---
# без жалобы доступ запрещён
main.app.dependency_overrides[main.get_current_user] = make(ids['chtest'])  # обычный юзер
print('admin list no-perm:', c.get('/api/admin/channels').status_code)
# жалоба на пост канала от chsub2
main.app.dependency_overrides[main.get_current_user] = make(ids['chsub2'])
r = c.post('/api/reports', data={'target_type': 'channel_post', 'target_id': pid, 'reason': 'spam'}).status_code
print('report created:', r)
# staff (is_admin=True) видит канал в модерации
from models import User as _U
with Session(engine) as s:
    staff_u = _U(username='chstaff', display_name='Staff', password_hash='x', is_admin=True)
    s.add(staff_u); s.commit()
    staff_id = staff_u.id
main.app.dependency_overrides[main.get_current_user] = make(staff_id)
lst = c.get('/api/admin/channels').json()
print('admin channels (reported only):', len(lst), lst[0]['name'] if lst else None, lst[0]['access_scope'] if lst else None)
posts = c.get(f'/api/channels/{cid}/posts' if False else f'/api/admin/channels/{cid}/posts').json()
print('admin sees posts:', len(posts) > 0)
# блокировка канала
print('block:', c.post(f'/api/admin/channels/{cid}/block?reason=spam').json())
main.app.dependency_overrides[main.get_current_user] = make(ids['chtest'])
print('post to blocked:', c.post(f'/api/channels/{cid}/posts', json={'text': 'x'}).status_code)

# --- ПЕРЕСЫЛКА ---
from models import Chat, ChatMember as _CM, Message as _Msg
with Session(engine) as s:
    g = Chat(is_group=True, name='ForwardGroup', owner_id=ids['chsub'])
    s.add(g); s.commit(); s.refresh(g)
    s.add(_CM(chat_id=g.id, user_id=ids['chsub'], role='owner'))
    s.commit()
    gid = g.id
# канал -> чат (chsub участник группы)
main.app.dependency_overrides[main.get_current_user] = make(ids['chsub'])
fres = c.post(f'/api/channels/{cid}/posts/{pid}/forward', json={'target_type': 'chat', 'target_id': gid})
print('channel->chat forward:', fres.status_code, fres.json().get('target_type'))
# канал -> другой канал
main.app.dependency_overrides[main.get_current_user] = make(ids['chtest'])
cid2 = c.post('/api/channels', json={'title':'T2','custom_slug':'fwd_ch2','is_public':True}).json()['channel']['id']
fres2 = c.post(f'/api/channels/{cid}/posts/{pid}/forward', json={'target_type':'channel','target_id':cid2})
print('channel->channel forward:', fres2.status_code, (fres2.json().get('post') or {}).get('text','')[:18].replace(chr(10),' '))
# чат -> канал (chtest должен быть участником группы chtest-админом cid2)
with Session(engine) as s:
    s.add(_CM(chat_id=gid, user_id=ids['chtest'], role='member'))
    gm = _Msg(chat_id=gid, sender_id=ids['chsub'], text='le chat msg')
    s.add(gm); s.commit(); s.refresh(gm)
    gmsg = gm.id
fres3 = c.post(f'/api/channels/{cid2}/posts', json={'forwarded_from_chat': gmsg})
print('chat->channel forward:', fres3.status_code, (fres3.json().get('post') or {}).get('text','')[:30].replace(chr(10),' '))
print('OK FULL')