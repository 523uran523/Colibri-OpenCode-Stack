using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Reflection;
[assembly: AssemblyVersion("1.2.0.0")]
[assembly: AssemblyFileVersion("1.2.0.0")]
[assembly: AssemblyInformationalVersion("1.2.0")]

internal static class EngeeAgentLauncher
{
    private static string Root;
    private static string InstallationId;
    private static bool NoBrowser;

    [STAThread]
    private static int Main(string[] args)
    {
        Root = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        using (SHA256 hash = SHA256.Create())
        {
            InstallationId = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(Root.ToLowerInvariant()))).Replace("-", "").ToLowerInvariant().Substring(0, 16);
        }
        int requestedPort = 0;
        foreach (string arg in args)
        {
            if (arg == "--no-browser") NoBrowser = true;
            else if (arg.StartsWith("--port=", StringComparison.Ordinal))
            {
                if (!Int32.TryParse(arg.Substring(7), NumberStyles.None, CultureInfo.InvariantCulture, out requestedPort) || requestedPort < 1024 || requestedPort > 65535)
                    return Fail("Некорректный номер порта. Используйте --port=3081.");
            }
            else return Fail("Неизвестный параметр: " + arg);
        }
        bool created;
        using (Mutex mutex = new Mutex(true, "Local\\EngeeAgentLauncher-" + InstallationId, out created))
        {
            if (!created) return 0;
            try { return Launch(requestedPort); }
            catch (Exception error) { return Fail(error.Message); }
            finally { mutex.ReleaseMutex(); }
        }
    }

    private static int Launch(int requestedPort)
    {
        string node = Path.Combine(Root, "resources", "runtime", "node.exe");
        string server = Path.Combine(Root, "resources", "web", "server.mjs");
        if (!File.Exists(node) || !File.Exists(server))
            return Fail("Не найдены файлы приложения. Распакуйте весь ZIP в одну папку и запустите EngeeAgent.exe из неё.");
        Directory.CreateDirectory(Path.Combine(Root, "data"));
        int first = requestedPort == 0 ? 3081 : requestedPort;
        int last = requestedPort == 0 ? 3090 : requestedPort;
        int available = 0;
        for (int port = first; port <= last; port++)
        {
            if (OurServer(port))
            {
                Log("Reusing this installation at port " + port.ToString(CultureInfo.InvariantCulture));
                return OpenBrowser(port);
            }
            if (available == 0 && PortAvailable(port)) available = port;
        }
        if (available == 0)
            return Fail("Порты " + first + "–" + last + " уже заняты. Закройте другое приложение вручную или выберите другой порт: EngeeAgent.exe --port=3091.");

        ProcessStartInfo info = new ProcessStartInfo(node, Quote(server));
        info.WorkingDirectory = Root;
        info.UseShellExecute = false;
        info.CreateNoWindow = true;
        info.WindowStyle = ProcessWindowStyle.Hidden;
        info.EnvironmentVariables["ENGEE_AGENT_PORT"] = available.ToString(CultureInfo.InvariantCulture);
        Process child = Process.Start(info);
        if (child == null) return Fail("Не удалось запустить сервер Engee Agent.");
        Log("Started server process " + child.Id.ToString(CultureInfo.InvariantCulture) + " at port " + available.ToString(CultureInfo.InvariantCulture));
        DateTime deadline = DateTime.UtcNow.AddSeconds(60);
        do
        {
            if (OurServer(available)) return OpenBrowser(available);
            if (child.HasExited)
                return Fail("Сервер завершился с кодом " + child.ExitCode.ToString(CultureInfo.InvariantCulture) + ". Для просмотра ошибки запустите Start-EngeeAgent.cmd.");
            Thread.Sleep(200);
        } while (DateTime.UtcNow < deadline);
        if (!child.HasExited) child.Kill();
        return Fail("Сервер не ответил за 60 секунд. Запустите Start-EngeeAgent.cmd для диагностики.");
    }

    private static bool PortAvailable(int port)
    {
        TcpListener listener = new TcpListener(IPAddress.Loopback, port);
        try { listener.Server.ExclusiveAddressUse = true; listener.Start(); return true; }
        catch (SocketException) { return false; }
        finally { listener.Stop(); }
    }

    private static bool OurServer(int port)
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port.ToString(CultureInfo.InvariantCulture) + "/api/health");
            request.Timeout = 300;
            request.ReadWriteTimeout = 300;
            request.Proxy = null;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
            {
                if (response.StatusCode != HttpStatusCode.OK) return false;
                string json = reader.ReadToEnd();
                if (json.Length > 16384) return false;
                Dictionary<string, object> health = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);
                object app;
                if (!health.TryGetValue("app", out app) || !String.Equals(Convert.ToString(app, CultureInfo.InvariantCulture), "engee-portable-agent", StringComparison.Ordinal)) return false;
                object installation;
                if (health.TryGetValue("installationId", out installation) && String.Equals(Convert.ToString(installation, CultureInfo.InvariantCulture), InstallationId, StringComparison.OrdinalIgnoreCase)) return true;
                if (health.TryGetValue("installationRoot", out installation))
                {
                    string actual = Path.GetFullPath(Convert.ToString(installation, CultureInfo.InvariantCulture)).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                    return String.Equals(actual, Root, StringComparison.OrdinalIgnoreCase);
                }
                return false;
            }
        }
        catch { return false; }
    }

    private static int OpenBrowser(int port)
    {
        string address = "http://127.0.0.1:" + port.ToString(CultureInfo.InvariantCulture) + "/";
        Log("Ready " + address);
        if (!NoBrowser) Process.Start(new ProcessStartInfo(address) { UseShellExecute = true });
        return 0;
    }

    private static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }

    private static int Fail(string message)
    {
        Log("ERROR " + message);
        if (!NoBrowser) MessageBox.Show(message, "Engee Agent — запуск", MessageBoxButtons.OK, MessageBoxIcon.Error);
        return 1;
    }

    private static void Log(string message)
    {
        try
        {
            string folder = Path.Combine(Root, "data");
            Directory.CreateDirectory(folder);
            File.AppendAllText(Path.Combine(folder, "launcher.log"), DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) + " " + message + Environment.NewLine, Encoding.UTF8);
        }
        catch { }
    }
}
