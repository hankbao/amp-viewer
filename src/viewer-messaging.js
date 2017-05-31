/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  APP,
  Messaging,
  MessageType,
  WindowPortEmulator,
} from 'amp-viewer-messaging/messaging';
import {messageHandler} from './message-handler';
import {log} from '../utils/log';


const CHANNEL_OPEN_MSG = 'channelOpen';

export class ViewerMessaging {

  /**
   * @param {!Window} win
   * @param {!HTMLIFrameElement} ampIframe
   * @param {string} frameOrigin
   * @param {boolean=} opt_isWebview Should viewer initiate handshake w/ polling
   * @param {boolean=} opt_isHandshakePoll
   * looking at.
   */
  constructor(win, ampIframe, frameOrigin, opt_isWebview,
    opt_isHandshakePoll) {
    /** @const {!Window} */
    this.win = win;
    /** @private {!HTMLIFrameElement} */
    this.ampIframe_ = ampIframe;
    /** @const {boolean} */
    this.isWebview_ = !!opt_isWebview;

    if (this.isWebview_ || opt_isHandshakePoll) {
      /** @private {number} */
      this.pollingIntervalId_ = setInterval(this.initiateHandshake_.bind(
        this, this.intervalCtr) , 1000); //poll every second
    } else {
      this.waitForHandshake_(frameOrigin);
    }
  }

  /**
   * @private
   */
  initiateHandshake_() {
    log('initiateHandshake_');
    if (this.ampIframe_) {
      const channel = new MessageChannel();
      let message = {
        app: APP,
        name: 'handshake-poll',
      };
      message = this.isWebview_ ? JSON.stringify(message) : message;
      this.ampIframe_.contentWindow./*OK*/postMessage(
        message, '*', [channel.port2]);

      channel.port1.onmessage = function(e) {
        const data = this.isWebview_ ? JSON.parse(e.data) : e.data;
        if (this.isChannelOpen_(data)) {
          this.win.clearInterval(this.pollingIntervalId_); //stop polling
          log('messaging established!');
          this.completeHandshake_(channel.port1, data.requestid);
        } else {
          messageHandler(data.name, data.data, data.rsvp);
        }
      }.bind(this);
    }
  }

  /**
   * @param {string} targetOrigin
   * @private
   */
  waitForHandshake_(targetOrigin) {
    log('awaitHandshake_');
    const listener = function(event) {
      log('message!', event);
      const target = this.ampIframe_.contentWindow;
      if (event.origin == targetOrigin &&
              this.isChannelOpen_(event.data) &&
              (!event.source || event.source == target)) {
        log(' messaging established with ', targetOrigin);
        this.win.removeEventListener('message', listener);
        const port = new WindowPortEmulator(this.win, targetOrigin, target);
        this.completeHandshake_(port, event.data.requestid);
      }
    }.bind(this);
    this.win.addEventListener('message', listener);
  }

  /**
   * @param {!MessagePort|!WindowPortEmulator} port
   * @param {string} requestId
   * @private
   */
  completeHandshake_(port, requestId) {
    let message = {
      app: APP,
      requestid: requestId,
      type: MessageType.RESPONSE,
    };

    message = this.isWebview_ ? JSON.stringify(message) : message;
    log('posting Message', message);
    port./*OK*/postMessage(message);

    this.messaging_ = new Messaging(this.win, port);
    this.messaging_.setDefaultHandler(messageHandler);

    this.sendRequest('visibilitychange', {
      state: this.visibilityState_,
      prerenderSize: this.prerenderSize,
    }, true);
  };

  /**
   * @param {*} eventData
   * @return {boolean}
   * @private
   */
  isChannelOpen_(eventData) {
    return eventData.app == APP && eventData.name == CHANNEL_OPEN_MSG;
  };

  /**
   * @param {string} type
   * @param {*} data
   * @param {boolean} awaitResponse
   * @return {!Promise<*>|undefined}
   */
  sendRequest(type, data, awaitResponse) {
    log('sendRequest');
    if (!this.messaging_) {
      return;
    }
    return this.messaging_.sendRequest(type, data, awaitResponse);
  };
}
