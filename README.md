# Clínica Santa Casa

App (PWA) para a clínica: o paciente pede consultas e exames, a recepção marca o horário, o paciente confirma presença e acompanha quando o resultado fica pronto. Uma assistente de IA (Groq) responde dúvidas com base nos dados do próprio paciente.

Feito em HTML + CSS + JavaScript, com Firebase (Auth, Firestore, Storage, Functions, Hosting, FCM).

- App do paciente: `index.html`, `login.html`, `cadastro.html`, `app/*`
- Painel da equipe: `admin/*`
- Regras de segurança: `firestore.rules` e `storage.rules`
- Backend: `functions/`

## Fluxo

| Paciente | Clínica |
|---|---|
| Pede consulta ou exame (particular ou convênio, data de preferência, foto do pedido médico) | Vê em **Pedidos** e clica em **Marcar horário** |
| Recebe o aviso e **confirma presença** | Acompanha na **Agenda** do dia |
| Vai ao atendimento | Clica em **Consulta realizada** ou **Exame realizado** (ou **Faltou**) |
| Vê o resultado como **Em análise**, com a previsão | Em **Resultados**, clica em **Resultado pronto** |
| Recebe o aviso **Pronto para retirada** e retira na recepção | Clica em **Entregue ao paciente** |

O resultado aparece **só como status**: o laudo não fica no sistema.

## Perfis da equipe

| Perfil | Pode |
|---|---|
| Recepção | Pedidos, agenda, conferir documentos, resultados |
| Laboratório / técnico | Atualizar o status dos resultados |
| Gestor | O que a recepção faz, mais exames/consultas, convênios e relatórios |
| Administrador | Tudo, inclusive usuários e configurações |

## 1. Configurar o Firebase (projeto `santacasa-20f1a`)

1. **Authentication → Método de login → ativar "E-mail/senha"**.
2. **Firestore Database → criar banco** (modo produção). Anote a região.
3. **Storage → começar**.
4. **Plano Blaze**, necessário para as Cloud Functions (IA, login por CPF, avisos e lembretes).
5. Se o banco **não** estiver em São Paulo (`southamerica-east1`), troque a região em `functions/config.js` (`REGION`) e em `js/firebase-config.js` (`FUNCTIONS_REGION`).

## 2. Publicar

```bash
cd ~/Downloads/"Saude Municipal"/clinica-santa-casa && firebase deploy --only firestore:rules,storage
```

Grave a chave da Groq. O comando pede a chave e não mostra o que você cola:

```bash
firebase functions:secrets:set GROQ_API_KEY
```

```bash
cd functions && npm install && cd .. && firebase deploy --only functions,hosting
```

Na primeira publicação de funções, pode aparecer "Permission denied while using the Eventarc Service Agent". Espere 3 minutos e rode o deploy de novo; é normal na primeira vez.

## 3. Primeiro administrador

1. Console → Authentication → **Adicionar usuário** (e-mail real). Copie o **UID**.
2. Console → Firestore → coleção `users` → documento com **ID = UID**:
   - `clinicId` (string): `clinica001`
   - `role` (string): `ADMIN`
   - `active` (boolean): `true`
   - `name` (string): o nome
   - `email` (string): o e-mail
3. Entre em `/admin/login.html`. Use "Esqueci minha senha" para definir a senha.
4. **Configurações:** preencha os dados da clínica e clique em **Criar dados iniciais**.
5. **Exames e consultas:** ajuste nomes, **preços**, preparos e prazos. Os valores criados são só exemplos.
6. **Convênios:** deixe ativos apenas os que a clínica aceita.
7. **Usuários:** crie a equipe. Cada pessoa recebe um e-mail para criar a própria senha.

## 4. Rodar localmente com emuladores

```bash
firebase emulators:start
```

Abra `http://127.0.0.1:5050/index.html?emulator=1`. Para voltar ao Firebase real, use `?emulator=0`.
Para testar a IA no emulador, crie `functions/.secret.local` com `GROQ_API_KEY=sua_chave` (o arquivo não vai para o Git).

## Decisões técnicas

- **Uma versão só do SDK** (12.4.0), em `js/lib/*.js`.
- **Consultas sem índice composto:** só filtros de igualdade, com ordenação no navegador.
- **Gravações em lote:** agendamento, histórico, auditoria e aviso são gravados juntos.
- **Regras do banco:** o paciente só cria pedidos (`REQUESTED`), só confirma presença e só cancela o que é dele. Horário, status e resultado só a equipe altera.
- **Storage:** a equipe é reconhecida pelo perfil gravado no login (custom claims, função `syncStaffClaims`). Não depende da integração Storage↔Firestore.
- **IA:** a chave fica só no Secret Manager. A função lista modelos alternativos e troca sozinha se a Groq desativar um deles.
