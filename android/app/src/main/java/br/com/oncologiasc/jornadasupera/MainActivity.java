package br.com.oncologiasc.jornadasupera;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
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

    /**
     * Pergunta ao app se ele cuida do voltar — fecha algo aberto ou volta de
     * tela (`window.superaHandleBack`, em `src/lib/androidBackButton.ts`). A
     * resposta chega como texto JSON.
     */
    private static final String HANDLE_BACK_SCRIPT =
        "typeof window.superaHandleBack === 'function' && window.superaHandleBack() === true";

    /**
     * A partir desta versão o WebView mede certo o recorte das barras do
     * sistema (`env(safe-area-inset-*)`), e o `SystemBars` do Capacitor deixa
     * as medidas chegarem à página. Antes dela, o Capacitor afasta a página das
     * barras por conta própria — e desenhar por baixo delas poria texto sob o
     * relógio. É o mesmo corte que o Capacitor usa.
     */
    private static final int WEBVIEW_VERSION_WITH_SAFE_AREA = 140;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        drawBehindSystemBars();
        createTeamUpdatesChannel();
        handleBackButton();
    }

    /**
     * A capa verde e o fundo de cada tela vão até a borda de cima, por baixo do
     * relógio, sem a faixa cinza do tema (pedido de 05/10/2026). O Android 15
     * já faz isso sozinho; do 8 ao 14 a janela precisa ser liberada aqui. A
     * página recua o próprio conteúdo pelo `--safe-top` (`index.css`), e a cor
     * dos ícones do relógio acompanha o que estiver atrás dele
     * (`useSystemBarsStyle`).
     *
     * Com WebView antigo nada muda: a barra continua com a cor do tema, mas o
     * conteúdo nunca fica escondido.
     */
    private void drawBehindSystemBars() {
        if (webViewMajorVersion() < WEBVIEW_VERSION_WITH_SAFE_AREA) return;

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
    }

    /** Versão principal do WebView do aparelho; 0 quando não dá para saber (Android 7). */
    private int webViewMajorVersion() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return 0;

        PackageInfo info = WebView.getCurrentWebViewPackage();
        if (info == null || info.versionName == null) return 0;

        try {
            return Integer.parseInt(info.versionName.split("\\.")[0]);
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

    /**
     * O botão voltar. Sem o plugin `@capacitor/app`, o Capacitor não o trata, e
     * o Android minimizava o app em qualquer tela. Agora o app é consultado
     * primeiro: ele fecha o que estiver aberto (a foto, uma folha) ou volta
     * para a tela anterior; só quando não há para onde voltar (as telas das
     * abas) o app é minimizado.
     */
    private void handleBackButton() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                getBridge().getWebView().evaluateJavascript(HANDLE_BACK_SCRIPT, handled -> {
                    if (!"true".equals(handled)) moveTaskToBack(true);
                });
            }
        });
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
