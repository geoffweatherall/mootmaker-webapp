import MenuIcon from '@mui/icons-material/Menu'
import { AppBar, Box, Container, Drawer, IconButton, Toolbar, Typography } from '@mui/material'
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import logo from '../assets/logo.svg'
import { AccountBox } from './AccountBox'
import { MenuContent } from './MenuContent'

const DRAWER_WIDTH = 260

/**
 * Responsive nav shell, following Material Design's standard pattern: a permanent sidebar on
 * desktop, collapsing to a hamburger-triggered flyout on narrow screens (< the "md" breakpoint).
 */
export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  function closeMobileMenu() {
    setMobileOpen(false)
  }

  const drawerContent = (
    <>
      <Toolbar sx={{ gap: 1.5 }}>
        <Box component="img" src={logo} alt="" sx={{ width: 32, height: 32 }} />
        <Typography variant="h6" component="div" noWrap>
          Mootmaker
        </Typography>
      </Toolbar>
      <MenuContent onNavigate={closeMobileMenu} />
      <AccountBox />
    </>
  )

  return (
    <Box sx={{ display: 'flex' }}>
      {/* Mobile-only top bar carrying the menu toggle; hidden from "md" up, where the sidebar
          below is permanently visible instead. */}
      <AppBar position="fixed" sx={{ display: { xs: 'block', md: 'none' }, zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <MenuIcon />
          </IconButton>
          <Box component="img" src={logo} alt="" sx={{ width: 28, height: 28, ml: 1.5, mr: 1 }} />
          <Typography variant="h6" component="div" noWrap>
            Mootmaker
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
        }}
      >
        {drawerContent}
      </Drawer>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={closeMobileMenu}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
        }}
      >
        {drawerContent}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        {/* Spacer matching the mobile app bar's height, so content doesn't start underneath it. */}
        <Toolbar sx={{ display: { xs: 'flex', md: 'none' } }} />
        <Container maxWidth="md" sx={{ py: 4 }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  )
}
