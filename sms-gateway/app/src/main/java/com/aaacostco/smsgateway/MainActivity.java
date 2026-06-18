package com.aaacostco.smsgateway;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.view.Gravity;
import android.graphics.Color;
import android.graphics.Typeface;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Simple UI showing the gateway status and a log of forwarded SMS messages.
 * The main purpose of this activity is to:
 * 1. Request SMS permissions on first launch
 * 2. Start the foreground service
 * 3. Display a live log of forwarded messages
 */
public class MainActivity extends AppCompatActivity {
    private static final int PERMISSION_REQUEST_CODE = 100;
    private static final String[] REQUIRED_PERMISSIONS = {
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS
    };

    private TextView statusText;
    private TextView logText;
    private ScrollView logScroll;
    private StringBuilder logBuffer = new StringBuilder();

    private BroadcastReceiver logReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Build UI programmatically (no XML layout needed for this simple app)
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(48, 80, 48, 48);
        root.setBackgroundColor(Color.parseColor("#F8FAFC"));

        // Title
        TextView title = new TextView(this);
        title.setText("📱 AAA Costco");
        title.setTextSize(28);
        title.setTypeface(null, Typeface.BOLD);
        title.setTextColor(Color.parseColor("#005DA3"));
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("SMS Gateway");
        subtitle.setTextSize(16);
        subtitle.setTextColor(Color.parseColor("#64748B"));
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, 8, 0, 32);
        root.addView(subtitle);

        // Status card
        LinearLayout statusCard = new LinearLayout(this);
        statusCard.setOrientation(LinearLayout.VERTICAL);
        statusCard.setPadding(32, 24, 32, 24);
        statusCard.setBackgroundColor(Color.WHITE);
        statusCard.setElevation(4);

        statusText = new TextView(this);
        statusText.setText("⏳ Эрх шалгаж байна...");
        statusText.setTextSize(16);
        statusText.setTextColor(Color.parseColor("#334155"));
        statusText.setGravity(Gravity.CENTER);
        statusCard.addView(statusText);
        root.addView(statusCard);

        // Log section
        TextView logTitle = new TextView(this);
        logTitle.setText("📋 Мессежийн лог");
        logTitle.setTextSize(14);
        logTitle.setTypeface(null, Typeface.BOLD);
        logTitle.setTextColor(Color.parseColor("#64748B"));
        logTitle.setPadding(0, 32, 0, 8);
        root.addView(logTitle);

        logScroll = new ScrollView(this);
        logScroll.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        logScroll.setBackgroundColor(Color.WHITE);
        logScroll.setPadding(16, 16, 16, 16);
        logScroll.setElevation(2);

        logText = new TextView(this);
        logText.setText("Мессеж хүлээж байна...\n");
        logText.setTextSize(12);
        logText.setTextColor(Color.parseColor("#475569"));
        logText.setTypeface(Typeface.MONOSPACE);
        logScroll.addView(logText);
        root.addView(logScroll);

        setContentView(root);

        // Check & request permissions
        checkPermissions();

        // Listen for SMS log broadcasts from SmsReceiver
        logReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String from = intent.getStringExtra("from");
                String body = intent.getStringExtra("body");
                long time = intent.getLongExtra("time", System.currentTimeMillis());
                String timeStr = new SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(new Date(time));

                logBuffer.insert(0, String.format("[%s] %s → %s\n", timeStr, from, body));
                logText.setText(logBuffer.toString());
            }
        };

        IntentFilter filter = new IntentFilter("com.aaacostco.smsgateway.SMS_LOG");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(logReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(logReceiver, filter);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (logReceiver != null) unregisterReceiver(logReceiver);
    }

    private void checkPermissions() {
        boolean allGranted = true;
        for (String perm : REQUIRED_PERMISSIONS) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                allGranted = false;
                break;
            }
        }

        if (allGranted) {
            onPermissionsGranted();
        } else {
            // Also request POST_NOTIFICATIONS for Android 13+
            String[] perms = REQUIRED_PERMISSIONS;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                perms = new String[]{
                        Manifest.permission.RECEIVE_SMS,
                        Manifest.permission.READ_SMS,
                        Manifest.permission.POST_NOTIFICATIONS
                };
            }
            ActivityCompat.requestPermissions(this, perms, PERMISSION_REQUEST_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            boolean smsGranted = false;
            for (int i = 0; i < permissions.length; i++) {
                if (Manifest.permission.RECEIVE_SMS.equals(permissions[i]) &&
                        grantResults[i] == PackageManager.PERMISSION_GRANTED) {
                    smsGranted = true;
                }
            }
            if (smsGranted) {
                onPermissionsGranted();
            } else {
                statusText.setText("❌ SMS эрх олгогдоогүй.\nТохиргоо → Апп → Эрх хэсгээс зөвшөөрнө үү.");
                statusText.setTextColor(Color.parseColor("#DC2626"));
            }
        }
    }

    private void onPermissionsGranted() {
        statusText.setText("✅ SMS Gateway ажиллаж байна\n\n60649999 дугаар руу ирсэн мессежийг серверлүү дамжуулна");
        statusText.setTextColor(Color.parseColor("#16A34A"));

        // Start foreground service
        Intent serviceIntent = new Intent(this, SmsForwardService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
    }
}
