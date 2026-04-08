/* eslint react/jsx-one-expression-per-line: 0 */
/* eslint react/no-array-index-key: 0 */

import React, { Component } from 'react';
import Loader from 'react-loader-spinner';
import { DashboardHeader } from '../dashboard/header';
import useLogin, { LoginState } from '../util/use_login';
import connection from './connection';
import { ConnectionStatus, MessageType } from '../common/bot_console/socket_event_enums';
import Embed, { Md } from './embed';
import './bot_console.css';
import '../main.css';

function renderMessage(msg, onImageLoad, onInteraction) {
  if (msg.type === MessageType.SYSTEM) {
    return (
      <div key={msg.id} className="bot-message">
        <em style={{ opacity: 0.5, fontSize: '0.85em' }}>{msg.text}</em>
      </div>
    );
  }

  if (msg.type === MessageType.USER) {
    return <div key={msg.id} className="user-message">{msg.text}</div>;
  }

  const {
    data, reactions, loadingButtonId, editedAt,
  } = msg;
  const components = data.components?.flatMap((group) => group.components || []) || [];
  const isLoading = !!loadingButtonId;
  const msgClass = editedAt ? 'bot-message bot-message-edited' : 'bot-message';

  return (
    <div key={editedAt ? `${msg.id}-${editedAt}` : msg.id} className={msgClass}>
      {data.content && (
        <div className="bot-content"><Md text={data.content} /></div>
      )}
      {data.embeds && data.embeds.map((embed, i) => (
        <Embed key={i} embed={embed} attachments={data.attachments} onImageLoad={onImageLoad} />
      ))}
      {components.length > 0 && (
        <div className="bot-components">
          {components.map((comp) => {
            const styleCls = comp.style ? ` style-${comp.style}` : '';
            const disabledCls = comp.disabled || isLoading ? ' disabled' : '';
            const loadingCls = loadingButtonId === comp.custom_id ? ' loading' : '';
            return (
              <button
                key={comp.custom_id}
                type="button"
                className={`bot-component-btn${styleCls}${disabledCls}${loadingCls}`}
                disabled={comp.disabled || isLoading}
                onClick={() => onInteraction(msg.serverId, comp.custom_id)}
              >
                {loadingButtonId === comp.custom_id ? '···' : comp.label}
              </button>
            );
          })}
        </div>
      )}
      {reactions && reactions.length > 0 && (
        <div className="bot-reactions">
          {reactions.map((emoji, i) => <span key={i} className="bot-reaction">{emoji}</span>)}
        </div>
      )}
    </div>
  );
}

class BotConsoleInner extends Component {
  constructor(props) {
    super(props);

    const connState = connection.getState();
    this.state = {
      messages: connState.messages,
      connectionStatus: connState.status,
      pending: connState.pending,
      prefixes: connState.prefixes,
      commands: connState.commands,
      suggestions: [],
      suggestionIndex: -1,
    };

    this.inputHistory = [];
    this.historyIndex = -1;
    this.savedInput = '';
    this.messageListRef = React.createRef();
  }

  componentDidMount() {
    this.unsubscribe = connection.subscribe((connState) => {
      this.setState({
        messages: connState.messages,
        connectionStatus: connState.status,
        pending: connState.pending,
        prefixes: connState.prefixes,
        commands: connState.commands,
      });
    });

    connection.connect();
    if (this.inputRef) this.inputRef.focus();

    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  componentDidUpdate() {
    this.scrollToBottom();
  }

  componentWillUnmount() {
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    if (this.unsubscribe) this.unsubscribe();
  }

  handleBeforeUnload = (e) => {
    if (connection.isConnected()) {
      e.preventDefault();
      // eslint-disable-next-line no-param-reassign
      e.returnValue = '';
    }
  }

  handleReconnect = () => {
    connection.reconnect();
  }

  handleInteraction = (messageId, customId) => {
    connection.interact(messageId, customId);
  }

  scrollToBottom = () => {
    const el = this.messageListRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  handleImageLoad = () => {
    this.scrollToBottom();
  }

  handleSubmit = (ev) => {
    ev.preventDefault();
    const input = this.inputRef;
    const text = input.value.trim();
    if (!text) return;

    this.inputHistory.push(text);
    this.historyIndex = -1;
    this.savedInput = '';

    input.value = '';
    input.style.height = 'auto';
    this.clearSuggestions();
    connection.send(text);
  }

  clearSuggestions = () => {
    this.setState({ suggestions: [], suggestionIndex: -1 });
  }

  handleAutoResize = () => {
    const el = this.inputRef;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  updateSuggestions = () => {
    const input = this.inputRef;
    if (!input) return;

    const { prefixes, commands } = this.state;
    const { value } = input;

    if (!value || !prefixes.length || !commands.length) {
      this.clearSuggestions();
      return;
    }

    const prefix = prefixes.find((p) => value.startsWith(p) || p.startsWith(value));
    if (!prefix) {
      this.clearSuggestions();
      return;
    }

    if (value.length < prefix.length) {
      this.clearSuggestions();
      return;
    }

    const afterPrefix = value.slice(prefix.length);
    if (afterPrefix.includes(' ')) {
      this.clearSuggestions();
      return;
    }

    const historyItems = [];
    const seenHistory = new Set();
    for (let i = this.inputHistory.length - 1; i >= 0; i -= 1) {
      const entry = this.inputHistory[i];
      const matchedPrefix = prefixes.find((p) => entry.startsWith(p));
      if (matchedPrefix) {
        const cmd = entry.slice(matchedPrefix.length).split(' ')[0];
        if (cmd && commands.includes(cmd) && cmd.startsWith(afterPrefix) && !seenHistory.has(entry)) {
          seenHistory.add(entry);
          historyItems.push({ label: entry.slice(matchedPrefix.length), value: entry });
        }
      }
    }

    const cmdItems = commands
      .filter((cmd) => cmd.startsWith(afterPrefix))
      .map((cmd) => ({ label: cmd, value: `${prefix}${cmd} ` }));

    const matches = [...historyItems, ...cmdItems].slice(0, 8);

    this.setState({ suggestions: matches, suggestionIndex: -1 });
  }

  acceptSuggestion = (suggestion) => {
    this.inputRef.value = suggestion.value;
    this.clearSuggestions();
    this.inputRef.focus();
  }

  handleKeyDown = (ev) => {
    // if user is trying to convert with IME, just ignore
    if (ev.isComposing || ev.keyCode === 229) return;
    const input = this.inputRef;
    const { suggestions, suggestionIndex } = this.state;

    if (ev.key === 'Tab') {
      ev.preventDefault();
      if (suggestions.length > 0) {
        const idx = suggestionIndex >= 0 ? suggestionIndex : 0;
        this.acceptSuggestion(suggestions[idx]);
      }
      return;
    }

    if (suggestions.length > 0) {
      if (ev.key === 'Enter' && suggestionIndex >= 0) {
        ev.preventDefault();
        this.acceptSuggestion(suggestions[suggestionIndex]);
        return;
      }

      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        this.setState((prev) => ({
          suggestionIndex: prev.suggestionIndex >= prev.suggestions.length - 1
            ? 0
            : prev.suggestionIndex + 1,
        }));
        return;
      }

      if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        this.setState((prev) => ({
          suggestionIndex: prev.suggestionIndex <= 0
            ? prev.suggestions.length - 1
            : prev.suggestionIndex - 1,
        }));
        return;
      }

      if (ev.key === 'Escape') {
        this.clearSuggestions();
        return;
      }
    }

    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      this.handleSubmit(ev);
      return;
    }

    if (ev.key === 'ArrowUp') {
      if (this.inputHistory.length === 0) return;
      if (input.selectionStart !== 0 || input.selectionEnd !== 0) return;

      ev.preventDefault();

      if (this.historyIndex === -1) {
        this.savedInput = input.value;
        this.historyIndex = this.inputHistory.length - 1;
      } else if (this.historyIndex > 0) {
        this.historyIndex -= 1;
      }

      input.value = this.inputHistory[this.historyIndex];
      this.handleAutoResize();
      return;
    }

    if (ev.key === 'ArrowDown') {
      if (this.historyIndex === -1) return;
      if (input.selectionStart !== input.value.length) return;

      ev.preventDefault();

      if (this.historyIndex < this.inputHistory.length - 1) {
        this.historyIndex += 1;
        input.value = this.inputHistory[this.historyIndex];
      } else {
        this.historyIndex = -1;
        input.value = this.savedInput;
      }
      this.handleAutoResize();
      return;
    }

    if (ev.key === 'Escape') {
      input.value = '';
      this.historyIndex = -1;
      this.savedInput = '';
    }
  }

  render() {
    const {
      messages, connectionStatus, pending, prefixes, suggestions, suggestionIndex,
    } = this.state;
    const p = (prefixes && prefixes[0]) || 'k!';

    if (connectionStatus === ConnectionStatus.UNAVAILABLE) {
      return (
        <div id="botConsoleContainer">
          <div id="messageList">
            <div id="messageListInner">
              <div id="consoleUnavailable">
                <h3>Console Unavailable</h3>
                <p>The bot console service is not running on this server.</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div id="botConsoleContainer">
        <div id="messageList" ref={this.messageListRef}>
          <div id="messageListInner">
            {connectionStatus === ConnectionStatus.CONNECTED && (
              <div id="consoleWelcome">
                <h3>Kotoba Console</h3>
                <p className="welcome-subtitle">Direct access to the bot — no Discord needed</p>
                <div className="welcome-commands">
                  <div className="welcome-section">
                    <h5>Quiz</h5>
                    <code>{p}quiz n5 5</code>
                    <code>{p}quiz n3 10 hardcore</code>
                    <code>{p}quiz save</code>
                    <code>{p}quiz load</code>
                  </div>
                  <div className="welcome-section">
                    <h5>Lookup</h5>
                    <code>{p}jisho 猫</code>
                    <code>{p}kanji 食</code>
                    <code>{p}strokeorder 書</code>
                    <code>{p}random n3</code>
                  </div>
                  <div className="welcome-section">
                    <h5>Other</h5>
                    <code>{p}draw 漢字 font=5</code>
                    <code>{p}shiritori</code>
                    <code>{p}settings</code>
                    <code>{p}help</code>
                  </div>
                </div>
                <p className="welcome-hint">Type a command below to get started. Use ↑↓ to recall previous commands.</p>
              </div>
            )}
            {messages.map((msg) => renderMessage(msg, this.handleImageLoad, this.handleInteraction))}
            {pending && (
              <div className="bot-typing">
                <span /><span /><span />
              </div>
            )}
          </div>
        </div>
        <div id="consoleInputArea">
          <form onSubmit={this.handleSubmit} autoComplete="off">
            <div className={`connection-dot ${connectionStatus}`} title={connectionStatus} />
            <div id="consoleInputWrapper">
              {suggestions.length > 0 && (
                <div className="console-suggestions">
                  {suggestions.map((s, i) => (
                    <button
                      key={s.value}
                      type="button"
                      className={`console-suggestion${i === suggestionIndex ? ' active' : ''}`}
                      onMouseDown={() => this.acceptSuggestion(s)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                rows="1"
                placeholder={connectionStatus === ConnectionStatus.CONNECTED ? 'Type a command or answer...' : 'Disconnected'}
                ref={(el) => { this.inputRef = el; }}
                disabled={connectionStatus !== ConnectionStatus.CONNECTED}
                onKeyDown={this.handleKeyDown}
                onInput={() => { this.handleAutoResize(); this.updateSuggestions(); }}
              />
            </div>
            {connectionStatus === ConnectionStatus.CONNECTED && (
              <button type="submit" id="consoleSendBtn">Send</button>
            )}
            {connectionStatus === ConnectionStatus.DISCONNECTED && (
              <button type="button" id="consoleReconnectBtn" onClick={this.handleReconnect}>Reconnect</button>
            )}
          </form>
        </div>
      </div>
    );
  }
}

function BotConsole() {
  const { loginState } = useLogin();

  if (loginState === LoginState.checking) {
    return (
      <div className="d-flex justify-content-center mt-5">
        <Loader type="ThreeDots" color="#336699" />
      </div>
    );
  }

  if (loginState !== LoginState.loggedIn) {
    return <DashboardHeader />;
  }

  return <BotConsoleInner />;
}

export default BotConsole;
