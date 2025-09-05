# Contributing to TillSync

Thank you for your interest in contributing to TillSync! This project aims to solve real problems for Kenyan small businesses.

## 🎯 How You Can Help

### 🐛 Bug Reports
- Use the [GitHub Issues](https://github.com/KebasoMoses/TillSync/issues) page
- Include screenshots if possible
- Describe steps to reproduce the bug
- Mention your device/browser version

### 💡 Feature Requests
- Check existing [GitHub Discussions](https://github.com/KebasoMoses/TillSync/discussions) first
- Explain the business problem it solves
- Provide examples or mockups if helpful

### 🔧 Code Contributions

#### Priority Areas
1. **SMS Parsing**: Support for more Kenyan mobile money formats
2. **Localization**: Swahili language support
3. **Export**: Excel/CSV export functionality
4. **Integrations**: WhatsApp alerts, POS systems
5. **Mobile**: Native Android app development

#### Getting Started
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Follow the existing code style and patterns
4. Test your changes thoroughly
5. Update documentation if needed
6. Submit a Pull Request

#### Code Style
- Use TypeScript for backend code
- Follow Hono framework patterns
- Use TailwindCSS for styling
- Write descriptive commit messages
- Include comments for complex logic

#### Testing
- Test with real M-Pesa SMS messages
- Verify mobile responsiveness
- Check API endpoints work correctly
- Test with sample data provided

## 🌍 Community Guidelines

### Be Respectful
- Use inclusive language
- Respect different perspectives
- Help newcomers learn
- Focus on constructive feedback

### Business Context
- Consider real Kenyan business needs
- Think about users with basic smartphones
- Remember internet connectivity challenges
- Design for daily business workflows

### Quality Standards
- Code should be production-ready
- Features should solve real problems
- UI should be mobile-first
- Performance matters (edge computing)

## 📝 Development Setup

1. **Clone and install**:
   ```bash
   git clone https://github.com/KebasoMoses/TillSync.git
   cd TillSync
   npm install
   ```

2. **Local development**:
   ```bash
   npm run build
   npm run db:migrate:local
   npm run db:seed
   pm2 start ecosystem.config.cjs
   ```

3. **Test your changes**:
   ```bash
   curl http://localhost:3000/api/dashboard
   # Test SMS parsing
   # Test mobile interface
   ```

## 🚀 Deployment

### Testing Deployment
- Deploy to your own Cloudflare Pages for testing
- Share preview URL for review
- Test with real SMS messages

### Production Deployment
- Only maintainers deploy to production
- All changes go through Pull Request review
- Must pass all tests and checks

## 📚 Resources

- [Hono Documentation](https://hono.dev/)
- [Cloudflare D1 Database](https://developers.cloudflare.com/d1/)
- [TailwindCSS](https://tailwindcss.com/)
- [M-Pesa API Documentation](https://developer.safaricom.co.ke/)

## 🏆 Recognition

Contributors will be:
- Added to the README contributors section
- Mentioned in release notes
- Invited to the maintainers team (for significant contributions)
- Given credit in any derived commercial applications

## 📞 Questions?

- **General Questions**: GitHub Discussions
- **Bug Reports**: GitHub Issues  
- **Security Issues**: Email maintainer directly
- **Business Inquiries**: Coming soon

---

**Thank you for helping make TillSync better for Kenyan entrepreneurs! 🇰🇪**