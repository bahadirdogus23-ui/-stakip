import pytest

pytestmark = pytest.mark.gui


@pytest.fixture
def window(qtbot):
    from automold3d.ui.main_window import MainWindow

    win = MainWindow()
    qtbot.addWidget(win)
    win.show()
    qtbot.waitExposed(win)
    yield win
    win.close()


def test_main_window_opens(window):
    assert window.isVisible()
    assert window.windowTitle().startswith("AutoMold 3D")


def test_turkish_menus_present(window):
    titles = [a.text() for a in window.menuBar().actions()]
    assert titles == ["Dosya", "Düzenle", "Model", "Kalıp", "Görünüm", "Araçlar", "Yardım"]


def test_unimplemented_actions_are_disabled_and_labelled(window):
    assert len(window.toolbar_actions) == 10
    for action in window.toolbar_actions.values():
        assert not action.isEnabled()
        assert "Henüz uygulanmadı" in action.toolTip()


def test_message_tabs(window):
    tabs = [window.message_tabs.tabText(i) for i in range(window.message_tabs.count())]
    assert tabs == ["Durum", "Uyarılar", "Hatalar"]
