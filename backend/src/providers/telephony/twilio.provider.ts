// ==============================================================================
// PROVIDER DE TELEFONÍA: Twilio
// Proyecto: VoicePilot AI
// ==============================================================================

import { twiml as TwilioTwiml } from 'twilio';
import {
  TelephonyProvider,
  IncomingCallPayload,
  SpeechResultPayload,
  VoiceResponse
} from './telephony-provider.interface';

const TWIML_CONTENT_TYPE = 'text/xml';

export class TwilioProvider implements TelephonyProvider {
  parseIncomingCall(rawBody: any): IncomingCallPayload {
    return {
      from: rawBody.From,
      to: rawBody.To,
      callSid: rawBody.CallSid
    };
  }

  parseSpeechResult(rawBody: any): SpeechResultPayload {
    return {
      from: rawBody.From,
      to: rawBody.To,
      callSid: rawBody.CallSid,
      speechResult: rawBody.SpeechResult || ''
    };
  }

  buildGreetingResponse(greetingMessage: string, gatherActionUrl: string): VoiceResponse {
    const response = new TwilioTwiml.VoiceResponse();
    const gather = response.gather({
      input: ['speech'],
      action: gatherActionUrl,
      method: 'POST',
      speechTimeout: 'auto',
      language: 'es-ES',
      // Sin esto, un silencio total (sin ningún audio detectado) no dispara
      // el webhook de /gather y la llamada queda colgada sin más.
      actionOnEmptyResult: true
    });
    gather.say({ language: 'es-ES' }, greetingMessage);

    return { body: response.toString(), contentType: TWIML_CONTENT_TYPE };
  }

  buildReplyResponse(aiReplyText: string, gatherActionUrl: string): VoiceResponse {
    const response = new TwilioTwiml.VoiceResponse();
    const gather = response.gather({
      input: ['speech'],
      action: gatherActionUrl,
      method: 'POST',
      speechTimeout: 'auto',
      language: 'es-ES',
      actionOnEmptyResult: true
    });
    gather.say({ language: 'es-ES' }, aiReplyText);

    return { body: response.toString(), contentType: TWIML_CONTENT_TYPE };
  }

  buildHangupResponse(finalMessage: string): VoiceResponse {
    const response = new TwilioTwiml.VoiceResponse();
    response.say({ language: 'es-ES' }, finalMessage);
    response.hangup();

    return { body: response.toString(), contentType: TWIML_CONTENT_TYPE };
  }
}
