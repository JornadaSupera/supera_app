package br.com.oncologiasc.jornadasupera;

import static org.junit.Assert.assertEquals;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Roda no aparelho ou no emulador: confere que o app instalado é o da Supera.
 * O modelo do Capacitor vinha com o pacote de exemplo (com.getcapacitor.app)
 * e falhava sempre.
 */
@RunWith(AndroidJUnit4.class)
public class AppPackageTest {

    @Test
    public void usesTheSuperaApplicationId() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();

        assertEquals("br.com.oncologiasc.jornadasupera", appContext.getPackageName());
    }
}
