import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';

async function comprobarModelos() {
  console.log('🔍 Probando API Key:', apiKey ? `${apiKey.substring(0, 8)}...` : '⚠️ NO ENCONTRADA EN .ENV');

  if (!apiKey) {
    console.error('❌ Configura GEMINI_API_KEY en tu archivo .env');
    return;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    const data = await response.json();

    if (data.error) {
      console.error('❌ Error devuelto por Google:');
      console.dir(data.error, { depth: null });
      return;
    }

    console.log('✅ ¡Conexión exitosa! Estos son los modelos habilitados para tu clave:');
    const compatibles = data.models.filter((m: any) =>
      m.supportedGenerationMethods?.includes('generateContent')
    );

    compatibles.forEach((m: any) => {
      console.log(` - ${m.name.replace('models/', '')}`);
    });
  } catch (err) {
    console.error('❌ Error de red o conexión:', err);
  }
}

comprobarModelos();