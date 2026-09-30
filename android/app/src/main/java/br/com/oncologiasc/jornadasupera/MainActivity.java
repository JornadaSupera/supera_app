package br.com.oncologiasc.jornadasupera;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Canal dos avisos da equipe (mensagem do chat, agenda, orientação nova).
     *
     * Importância alta: o aviso aparece em balão no topo da tela, também com o
     * app aberto. No canal padrão do OneSignal ("Miscellaneous", importância
     * normal) ele só entrava na barra de status, e com o app aberto parecia
     * que não tinha chegado. O servidor manda o push para cá pelo
     * `existing_android_channel_id` do OneSignal; sem esse campo, o aviso
     * continua indo para o canal padrão.
     *
     * O id não pode mudar: o Android guarda por canal o que a pessoa escolher
     * (som, balão, silenciar), e um id novo seria outro canal.
     */
    static final String TEAM_UPDATES_CHANNEL_ID = "team_updates";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createTeamUpdatesChannel();
    }

    /**
     * Cria o canal (ou só atualiza nome e descrição, se ele já existe: a
     * importância de um canal existente fica como a pessoa deixou). Canais
     * existem a partir do Android 8; antes disso o aviso usa a prioridade do
     * próprio push.
     */
    private void createTeamUpdatesChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel channel = new NotificationChannel(
            TEAM_UPDATES_CHANNEL_ID,
            getString(R.string.notification_channel_team_updates_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(getString(R.string.notification_channel_team_updates_description));
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }
}
