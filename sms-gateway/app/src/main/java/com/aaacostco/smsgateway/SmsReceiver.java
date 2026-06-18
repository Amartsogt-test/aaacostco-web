package com.aaacostco.smsgateway;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;

import java.io.IOException;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Receives incoming SMS messages and forwards them to the Firebase Cloud Function
 * (smsWebhook) for phone verification.
 */
public class SmsReceiver extends BroadcastReceiver {
    private static final String TAG = "SmsReceiver";

    // ⚠️ CONFIGURE THESE before deploying:
    // The webhook URL is the deployed smsWebhook Cloud Function URL.
    // Format: https://<region>-<project>.cloudfunctions.net/smsWebhook
    private static final String WEBHOOK_URL =
            "https://asia-northeast3-costco-fe034.cloudfunctions.net/smsWebhook";

    // A shared secret to authenticate the gateway → server connection.
    // Set the same value in functions/.env as SMS_WEBHOOK_SECRET
    private static final String WEBHOOK_SECRET = "costco-sms-gateway-2026";

    private static final OkHttpClient client = new OkHttpClient();
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!"android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) return;

        Bundle bundle = intent.getExtras();
        if (bundle == null) return;

        Object[] pdus = (Object[]) bundle.get("pdus");
        if (pdus == null) return;

        String format = bundle.getString("format");

        for (Object pdu : pdus) {
            SmsMessage sms = SmsMessage.createFromPdu((byte[]) pdu, format);
            String from = sms.getDisplayOriginatingAddress();
            String body = sms.getMessageBody();

            if (from == null || body == null) continue;
            body = body.trim();

            // Only forward messages that look like verification codes (1-4 digits)
            if (!body.matches("\\d{1,4}")) {
                Log.d(TAG, "Skipping non-code SMS from " + from + ": " + body);
                continue;
            }

            Log.i(TAG, "Forwarding SMS: from=" + from + ", body=" + body);
            forwardToWebhook(from, body);

            // Update the UI log if the service is running
            Intent logIntent = new Intent("com.aaacostco.smsgateway.SMS_LOG");
            logIntent.putExtra("from", from);
            logIntent.putExtra("body", body);
            logIntent.putExtra("time", System.currentTimeMillis());
            context.sendBroadcast(logIntent);
        }
    }

    private void forwardToWebhook(String from, String body) {
        // Clean the phone number (remove +976 prefix, spaces, dashes)
        String cleanPhone = from.replaceAll("[^0-9]", "");
        if (cleanPhone.startsWith("976") && cleanPhone.length() > 8) {
            cleanPhone = cleanPhone.substring(3);
        }

        String json = "{"
                + "\"from\":\"" + cleanPhone + "\","
                + "\"body\":\"" + body + "\","
                + "\"secret\":\"" + WEBHOOK_SECRET + "\""
                + "}";

        Request request = new Request.Builder()
                .url(WEBHOOK_URL)
                .post(RequestBody.create(json, JSON))
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "Webhook call failed: " + e.getMessage());
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                Log.i(TAG, "Webhook response: " + response.code() + " " + response.body().string());
                response.close();
            }
        });
    }
}
