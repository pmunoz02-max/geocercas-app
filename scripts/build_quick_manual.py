"""Build the three public quick manuals. Requires reportlab. Usage: python script.py OUTPUT_DIR."""
from pathlib import Path
import sys
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.enums import TA_LEFT

COPY = {
 'es': {
  'title':'Manual rápido', 'edition':'Guía operativa • Septiembre 2026',
  'pages':[
   ('01 / ADMINISTRADOR', 'Prepara el trabajo', 'De la organización a una invitación lista para usar.', [
    ('Selecciona la organización', 'Inicia sesión en GeoField GPS y confirma la organización desde la que vas a trabajar. Revisa el cupo de trackers disponible antes de invitar.'),
    ('Prepara persona y asignación', 'Registra a la persona en Personal con su correo correcto. Crea la geocerca y una asignación activa con fechas y horario vigentes. En Invitar tracker solo aparecen personas con asignaciones vigentes.'),
    ('Envía una invitación', 'En Invitar tracker selecciona a la persona, verifica el correo y pulsa Enviar invitación una vez. Espera la confirmación. El formulario bloquea envíos repetidos mientras procesa y después de un envío exitoso para ese destinatario.'),
    ('Coordina la comprobación', 'Pide al destinatario que use su teléfono Android de trabajo y el correo de la invitación. Mantén abierto Tracker / Panel de seguimiento para confirmar la recepción de posiciones.')],
    'Antes de salir', 'Organización correcta · correo revisado · asignación vigente · cupo disponible.'),
   ('02 / TRACKER', 'Instala y activa', 'La app Android realiza el seguimiento del teléfono.', [
    ('Instala GeoField GPS', 'Usa el enlace oficial de instalación facilitado por tu organización y mantén la app actualizada desde Google Play. Haz la activación en el mismo teléfono que llevarás durante la jornada.'),
    ('Abre la invitación más reciente', 'Abre el correo más reciente en tu teléfono y sigue el enlace de invitación. Si se abre en Chrome o Gmail, continúa en la app GeoField GPS. El navegador por sí solo no inicia el seguimiento de Android.'),
    ('Revisa y acepta', 'Lee el aviso de uso de ubicación y acepta solo si estás de acuerdo. Si se solicita iniciar sesión, usa el correo destinatario. Pulsa Ya tengo la app cuando corresponda y concede los permisos solicitados.'),
    ('Si recibiste un código', 'Como alternativa, si tu administrador te entregó un código de emparejamiento, inicia sesión con Magic Link y usa Activar tracking con código en la pantalla correspondiente. No compartas el código ni el enlace.')],
    'Resultado esperado', 'Ver Seguimiento activo en el móvil es el primer paso. Confirma además una posición reciente en el dashboard.'),
   ('03 / MÓVIL Y DASHBOARD', 'Comprueba el seguimiento', 'Verifica los dos extremos antes de comenzar la jornada.', [
    ('Ubicación e internet', 'Mantén activados la ubicación precisa y el acceso a internet. En los ajustes de la app permite ubicación siempre si Android lo solicita para el seguimiento en segundo plano.'),
    ('Permisos del teléfono', 'Revisa Batería sin restricción, Autoinicio y Datos en segundo plano. La disponibilidad y los nombres dependen del fabricante. Usa los accesos de Permisos críticos del tracker y confirma los ajustes en Android.'),
    ('Valida una posición recibida', 'En el Panel de seguimiento selecciona la organización y el tracker correctos. Revisa los filtros de tiempo y estado, pulsa Actualizar y comprueba Última posición y Última actualización. Confirma que la hora avanza.'),
    ('Durante la jornada', 'Mantén batería suficiente y evita forzar el cierre de la app. Al terminar, puedes revocar el permiso de ubicación desde Android para detener el acceso; avisa al administrador si ya no debes compartir ubicación.')],
    'Control de salida', 'Móvil activo + posición reciente en el dashboard. Si solo aparece activo en el móvil, sigue las comprobaciones de la página siguiente.'),
   ('04 / AYUDA', 'Resuelve lo más frecuente', 'Revisa estas causas antes de reenviar una invitación.', [
    ('No se encuentra la invitación', 'Si aparece invite_not_found, comprueba que abriste el correo más reciente y el enlace completo. Un enlace anterior puede haber sido reemplazado. Si falla el más reciente, solicita al administrador que revise la invitación.'),
    ('El enlace se queda en el navegador', 'Comprueba que la app Android esté instalada y actualizada. Abre el enlace con GeoField GPS; si es necesario, revisa Abrir de forma predeterminada en los ajustes de la app. No uses la versión Preview para una invitación de Producción.'),
    ('Activo en móvil, sin conexión en panel', 'Comprueba internet, GPS, permisos y ahorro de batería. El administrador debe revisar la organización, los filtros, la asignación y su horario, además de que la persona esté vinculada al usuario correcto.'),
    ('Plan o cupo bloqueado', 'El administrador debe revisar el estado del plan y los trackers utilizados. No envíes repetidamente para intentar saltar el límite. Para soporte, indica la hora y el mensaje del error; no compartas tokens, enlaces privados ni contraseñas.')],
    'Más ayuda', 'Abre el Centro de ayuda o contacta al administrador de tu organización. Recursos y soporte están disponibles en los enlaces inferiores.')],
  'resources':'Recursos', 'support':'Soporte', 'page':'Página'
 },
 'en': {
  'title':'Quick manual', 'edition':'Operations guide • September 2026',
  'pages':[
   ('01 / ADMINISTRATOR', 'Prepare the work', 'From organization setup to an invitation ready to use.', [
    ('Choose the organization', 'Sign in to GeoField GPS and confirm the organization you are working in. Check the available tracker capacity before inviting anyone.'),
    ('Prepare the person and assignment', 'Register the person in Personnel with the correct email. Create the geofence and an active assignment with valid dates and working hours. Invite tracker only lists people with current assignments.'),
    ('Send one invitation', 'In Invite tracker, select the person, check the email and press Send invitation once. Wait for confirmation. The form blocks repeat submissions while processing and after a successful send to that recipient.'),
    ('Arrange verification', 'Ask the recipient to use their work Android phone and invitation email. Keep Tracker / Tracking dashboard open to confirm that positions arrive.')],
    'Before leaving', 'Correct organization · checked email · current assignment · available capacity.'),
   ('02 / TRACKER', 'Install and activate', 'The Android app tracks the phone location.', [
    ('Install GeoField GPS', 'Use the official installation link provided by your organization and keep the app updated through Google Play. Activate it on the same phone you will carry during work.'),
    ('Open the latest invitation', 'Open the latest email on your phone and follow the invitation link. If it opens in Chrome or Gmail, continue in the GeoField GPS app. The browser alone cannot start Android tracking.'),
    ('Review and accept', 'Read the location notice and accept only if you agree. If asked to sign in, use the recipient email. Choose I already have the app when offered and grant the requested permissions.'),
    ('If you received a code', 'Alternatively, if your administrator provided a pairing code, sign in with Magic Link and use Activate tracking with code on the corresponding screen. Do not share the code or invitation link.')],
    'Expected result', 'Tracking active on the phone is the first check. Also confirm a recent position in the dashboard.'),
   ('03 / PHONE AND DASHBOARD', 'Verify tracking', 'Check both ends before starting work.', [
    ('Location and internet', 'Keep precise location and internet access enabled. Allow location all the time in the app settings if Android requests it for background tracking.'),
    ('Phone permissions', 'Review unrestricted battery use, autostart and background data. Names and availability depend on the phone manufacturer. Use the critical tracker permission shortcuts and confirm the settings in Android.'),
    ('Confirm a received position', 'In the Tracking dashboard choose the correct organization and tracker. Review the time and status filters, refresh, and check Last position and Last update. Confirm that the timestamp advances.'),
    ('During work', 'Keep enough battery and avoid force-stopping the app. When finished, you can revoke location permission in Android to stop access; notify your administrator if you should no longer share your location.')],
    'Departure check', 'Active phone + recent dashboard position. If only the phone shows active, follow the checks on the next page.'),
   ('04 / HELP', 'Solve common issues', 'Check these causes before sending another invitation.', [
    ('Invitation not found', 'For invite_not_found, check that you opened the latest email and the complete link. An earlier link may have been replaced. If the latest one fails, ask the administrator to review the invitation.'),
    ('The link stays in the browser', 'Check that the Android app is installed and updated. Open the link with GeoField GPS; if needed, review Open by default in its Android settings. Do not use the Preview app for a Production invitation.'),
    ('Active phone, offline dashboard', 'Check internet, GPS, permissions and battery saving. The administrator should check the organization, filters, assignment and working hours, and that the person is linked to the correct user.'),
    ('Plan or capacity blocked', 'The administrator should review plan status and tracker usage. Do not repeatedly send to bypass a limit. For support, provide the time and error message; never share tokens, private invitation links or passwords.')],
    'More help', 'Open the Help Center or contact your organization administrator. Resources and support are linked below.')],
  'resources':'Resources', 'support':'Support', 'page':'Page'
 },
 'fr': {
  'title':'Guide rapide', 'edition':'Guide opérationnel • Septembre 2026',
  'pages':[
   ('01 / ADMINISTRATEUR', 'Préparez le travail', "De l'organisation à une invitation prête à utiliser.", [
    ("Choisissez l'organisation", "Connectez-vous à GeoField GPS et vérifiez l'organisation sélectionnée. Consultez le nombre de places disponibles pour les trackers avant toute invitation."),
    ("Préparez la personne et l'affectation", "Enregistrez la personne dans Personnel avec son adresse e-mail correcte. Créez la géofence et une affectation active aux dates et horaires valides. Inviter tracker ne propose que les personnes ayant une affectation en cours."),
    ('Envoyez une invitation', "Dans Inviter tracker, sélectionnez la personne, vérifiez son e-mail et envoyez une seule fois. Attendez la confirmation. Le formulaire bloque les envois répétés pendant le traitement et après un envoi réussi au même destinataire."),
    ('Organisez la vérification', "Demandez au destinataire d'utiliser son téléphone Android de travail et l'e-mail de l'invitation. Gardez le panneau de suivi ouvert pour confirmer la réception des positions.")],
    'Avant le départ', 'Organisation correcte · e-mail vérifié · affectation en cours · place disponible.'),
   ('02 / TRACKER', 'Installez et activez', "L'application Android assure le suivi du téléphone.", [
    ('Installez GeoField GPS', "Utilisez le lien officiel fourni par votre organisation et maintenez l'application à jour depuis Google Play. Activez-la sur le téléphone que vous utiliserez pendant le travail."),
    ("Ouvrez l'invitation la plus récente", "Ouvrez le dernier e-mail sur votre téléphone et suivez le lien. S'il s'ouvre dans Chrome ou Gmail, continuez dans GeoField GPS. Le navigateur seul ne peut pas démarrer le suivi Android."),
    ('Vérifiez et acceptez', "Lisez l'avis sur la localisation et acceptez uniquement si vous êtes d'accord. Si une connexion est demandée, utilisez l'e-mail destinataire. Choisissez J'ai déjà l'application si proposé et accordez les autorisations demandées."),
    ('Si vous avez reçu un code', "Si votre administrateur vous a fourni un code d'appairage, vous pouvez aussi vous connecter avec Magic Link et utiliser Activer le suivi avec un code sur l'écran correspondant. Ne partagez ni le code ni le lien.")],
    'Résultat attendu', 'Suivi actif sur le téléphone est une première vérification. Confirmez aussi une position récente dans le tableau de bord.'),
   ('03 / TÉLÉPHONE ET TABLEAU DE BORD', 'Vérifiez le suivi', 'Contrôlez les deux côtés avant de commencer le travail.', [
    ('Localisation et internet', "Gardez la localisation précise et internet activés. Autorisez toujours la localisation dans les paramètres si Android le demande pour le suivi en arrière-plan."),
    ('Autorisations du téléphone', "Vérifiez la batterie sans restriction, le démarrage automatique et les données en arrière-plan. Les noms et options varient selon le fabricant. Utilisez les raccourcis des autorisations critiques et confirmez les paramètres dans Android."),
    ('Confirmez une position reçue', "Dans le panneau de suivi, choisissez l'organisation et le tracker corrects. Vérifiez les filtres de temps et de statut, actualisez et consultez la dernière position et la dernière mise à jour. Vérifiez que l'heure progresse."),
    ('Pendant le travail', "Gardez suffisamment de batterie et évitez de forcer l'arrêt de l'application. À la fin, vous pouvez retirer l'autorisation de localisation dans Android pour arrêter l'accès ; prévenez l'administrateur si vous ne devez plus partager votre position.")],
    'Contrôle de départ', 'Téléphone actif + position récente dans le tableau de bord. Si seul le téléphone est actif, suivez les vérifications de la page suivante.'),
   ('04 / AIDE', 'Résolvez les cas fréquents', "Vérifiez ces causes avant de renvoyer une invitation.", [
    ('Invitation introuvable', "Pour invite_not_found, vérifiez que vous avez ouvert le dernier e-mail et le lien complet. Un ancien lien peut avoir été remplacé. Si le plus récent échoue, demandez à l'administrateur de vérifier l'invitation."),
    ('Le lien reste dans le navigateur', "Vérifiez que l'application Android est installée et à jour. Ouvrez le lien avec GeoField GPS ; au besoin, vérifiez Ouvrir par défaut dans ses paramètres Android. N'utilisez pas l'application Preview pour une invitation de Production."),
    ('Téléphone actif, panneau hors ligne', "Vérifiez internet, GPS, autorisations et économie de batterie. L'administrateur doit contrôler l'organisation, les filtres, l'affectation et ses horaires, ainsi que le lien de la personne avec le bon utilisateur."),
    ('Forfait ou capacité bloqués', "L'administrateur doit vérifier le statut du forfait et le nombre de trackers utilisés. Ne multipliez pas les envois pour contourner la limite. Pour le support, donnez l'heure et le message d'erreur ; jamais de jetons, liens privés ou mots de passe.")],
    "Plus d'aide", "Ouvrez le centre d'aide ou contactez l'administrateur de votre organisation. Les liens vers les ressources et le support sont ci-dessous.")],
  'resources':'Ressources', 'support':'Support', 'page':'Page'
 }
}

W,H = 595.28,841.89
DARK, GREEN, TEXT = '#064e3b','#059669','#334155'
def paragraph(c,text,x,y,width,size=11,color=TEXT,bold=False):
    style=ParagraphStyle('p',fontName='Helvetica-Bold' if bold else 'Helvetica',fontSize=size,leading=size*1.45,textColor=HexColor(color),alignment=TA_LEFT)
    p=Paragraph(escape(text),style)
    _,height=p.wrap(width,700)
    p.drawOn(c,x,y-height)
    return y-height

def build(output):
    output.mkdir(parents=True,exist_ok=True)
    for lang,copy in COPY.items():
        path=output/f'geofield-gps-manual-{lang}.pdf'
        c=canvas.Canvas(str(path),pagesize=(W,H),pageCompression=1,invariant=1)
        c.setTitle('GeoField GPS - '+copy['title'])
        c.setAuthor('GeoField GPS')
        c.setSubject(copy['edition'])
        for number,(eyebrow,title,subtitle,steps,note_title,note) in enumerate(copy['pages'],1):
            c.setFillColor(HexColor(DARK)); c.rect(0,H-188,W,188,fill=1,stroke=0)
            paragraph(c,'GEOFIELD GPS  /  '+copy['title'].upper(),40,H-30,W-80,10,'#a7f3d0',True)
            paragraph(c,eyebrow,40,H-62,W-80,9,'#a7f3d0',True)
            paragraph(c,title,40,H-88,W-80,26,'#ffffff',True)
            paragraph(c,subtitle,40,H-134,W-80,11,'#ecfdf5')
            y=H-217
            for index,(heading,body) in enumerate(steps,1):
                c.setFillColor(HexColor('#d1fae5')); c.circle(51,y-11,12,fill=1,stroke=0)
                c.setFillColor(HexColor(DARK)); c.setFont('Helvetica-Bold',10); c.drawCentredString(51,y-14,str(index))
                y=paragraph(c,heading,76,y,W-116,12,DARK,True)-6
                y=paragraph(c,body,76,y,W-116,10.5)-22
            if y<180: raise ValueError(f'Content overflow: {lang} page {number}: {y}')
            c.setFillColor(HexColor('#ecfdf5')); c.roundRect(40,86,W-80,90,10,fill=1,stroke=0)
            paragraph(c,note_title,54,163,W-108,11,DARK,True)
            paragraph(c,note,54,141,W-108,10,DARK)
            c.setStrokeColor(HexColor('#d1d5db')); c.line(40,69,W-40,69)
            c.setFont('Helvetica',8); c.setFillColor(HexColor(TEXT)); c.drawString(40,52,copy['edition'])
            c.drawRightString(W-40,52,f"{copy['page']} {number} / 4")
            for x,label,url in [(40,copy['resources'],'https://app.tugeocercas.com/recursos'),(160,copy['support'],'https://app.tugeocercas.com/help/support')]:
                c.setFillColor(HexColor(GREEN)); c.drawString(x,35,label)
                c.linkURL(url,(x,31,x+100,45),relative=0)
            c.showPage()
        c.save()
        print(path)

if __name__=='__main__':
    build(Path(sys.argv[1]))
